using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using Umbraco.Cms.Infrastructure.Scoping;

[ApiController]
[Route("umbraco/api/mediafinder")]
public class MediaFinderController : ControllerBase
{
    private readonly IScopeProvider _scopeProvider;

    public MediaFinderController(IScopeProvider scopeProvider)
    {
        _scopeProvider = scopeProvider;
    }

    [HttpGet("search")]
    public IActionResult Search(
        [FromQuery] string searchType,
        [FromQuery] string? query,
        [FromQuery] long? minSize,
        [FromQuery] long? maxSize,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string orderBy = "name",
        [FromQuery] string orderDir = "asc")
    {
        var mediaGuid = new Guid("B796F64C-1F99-4FFB-B886-4BF4BC011A9C");

        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 20;
        if (pageSize > 100) pageSize = 100;

        // Safe ORDER BY mapping — no user input in SQL
        var dir = orderDir?.ToLowerInvariant() == "desc" ? "DESC" : "ASC";
        string orderClause;
        switch (orderBy?.ToLowerInvariant())
        {
            case "type":
                orderClause = $"pdExt.varcharValue {dir}, n.text ASC";
                break;
            case "size":
                orderClause = $"COALESCE(CAST(NULLIF(pdBytes.varcharValue, '') AS BIGINT), 0) {dir}, n.text ASC";
                break;
            default: // "name"
                orderClause = $"n.text {dir}";
                break;
        }

        var offset = (page - 1) * pageSize;

        using var scope = _scopeProvider.CreateScope(autoComplete: true);
        var db = scope.Database;

        // Detect database type for pagination syntax
        var isSqlite = db.DatabaseType.GetType().Name.IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0;
        string orderAndPage;
        if (isSqlite)
            orderAndPage = $"ORDER BY {orderClause} LIMIT {pageSize} OFFSET {offset}";
        else
            orderAndPage = $"ORDER BY {orderClause} OFFSET {offset} ROWS FETCH NEXT {pageSize} ROWS ONLY";

        // Common FROM/JOIN block used by all search types
        // All branches now include pdBytes LEFT JOIN for sorting by size
        const string commonJoins = @"
            FROM umbracoNode n
            INNER JOIN umbracoContent c ON n.id = c.nodeId
            INNER JOIN cmsContentType ct ON c.contentTypeId = ct.nodeId
            INNER JOIN umbracoContentVersion cv ON n.id = cv.nodeId AND cv.[current] = 1
            LEFT JOIN umbracoPropertyData pdExt ON cv.id = pdExt.versionId
                AND pdExt.propertyTypeId IN (SELECT id FROM cmsPropertyType WHERE alias = 'umbracoExtension')
            LEFT JOIN umbracoPropertyData pdBytes ON cv.id = pdBytes.versionId
                AND pdBytes.propertyTypeId IN (SELECT id FROM cmsPropertyType WHERE alias = 'umbracoBytes')";

        const string commonWhere = @"
            WHERE n.nodeObjectType = @0
              AND ct.alias <> 'Folder'";

        string filterWhere;
        object[] filterParams;

        switch (searchType?.ToLowerInvariant())
        {
            case "name":
                if (string.IsNullOrWhiteSpace(query))
                    return BadRequest(new { error = "Query is required for name search." });
                filterWhere = " AND n.text LIKE @1";
                filterParams = new object[] { mediaGuid, $"%{query}%" };
                break;

            case "type":
                if (string.IsNullOrWhiteSpace(query))
                    return BadRequest(new { error = "Query is required for type search." });
                var typeQuery = query.ToLowerInvariant().TrimStart('.');
                filterWhere = @" AND (LOWER(LTRIM(RTRIM(COALESCE(pdExt.varcharValue, '')))) = @1
                                      OR LOWER(ct.alias) = @1)";
                filterParams = new object[] { mediaGuid, typeQuery };
                break;

            case "size":
                if (!minSize.HasValue && !maxSize.HasValue)
                    return BadRequest(new { error = "At least one of minSize or maxSize is required for size search." });

                var sizeFilter = " AND pdBytes.varcharValue IS NOT NULL AND pdBytes.varcharValue <> ''";
                var sizeParams = new List<object> { mediaGuid };

                if (minSize.HasValue)
                {
                    sizeFilter += $" AND CAST(pdBytes.varcharValue AS BIGINT) >= @{sizeParams.Count}";
                    sizeParams.Add(minSize.Value);
                }
                if (maxSize.HasValue)
                {
                    sizeFilter += $" AND CAST(pdBytes.varcharValue AS BIGINT) <= @{sizeParams.Count}";
                    sizeParams.Add(maxSize.Value);
                }

                filterWhere = sizeFilter;
                filterParams = sizeParams.ToArray();
                break;

            default:
                return BadRequest(new { error = "searchType must be 'name', 'size', or 'type'." });
        }

        // Count query
        var countSql = $"SELECT COUNT(*) {commonJoins} {commonWhere} {filterWhere}";
        var totalCount = db.ExecuteScalar<int>(countSql, filterParams);

        // Results query
        var selectSql = $@"
            SELECT n.id AS Id, n.uniqueId AS UniqueId, n.text AS Name,
                   ct.alias AS MediaType,
                   LOWER(LTRIM(RTRIM(COALESCE(pdExt.varcharValue, '')))) AS Extension
            {commonJoins} {commonWhere} {filterWhere}
            {orderAndPage}";

        var rows = db.Fetch<dynamic>(selectSql, filterParams);

        // Fetch sizes for the current page's items
        var nodeIds = rows.Select(r => (int)r.Id).ToList();
        var sizeMap = new Dictionary<int, long>();

        if (nodeIds.Any())
        {
            var sizeRows = db.Fetch<dynamic>(@"
                SELECT cv.nodeId AS Id,
                       CAST(pd.varcharValue AS BIGINT) AS SizeBytes
                FROM umbracoContentVersion cv
                INNER JOIN umbracoPropertyData pd ON cv.id = pd.versionId
                INNER JOIN cmsPropertyType pt ON pd.propertyTypeId = pt.id
                WHERE cv.[current] = 1
                  AND pt.alias = 'umbracoBytes'
                  AND pd.varcharValue IS NOT NULL AND pd.varcharValue <> ''
                  AND cv.nodeId IN (" + string.Join(",", nodeIds) + ")");

            foreach (var sr in sizeRows)
                sizeMap[(int)sr.Id] = (long)sr.SizeBytes;
        }

        var results = rows.Select(row => new
        {
            id = (int)row.Id,
            uniqueId = Guid.Parse(row.UniqueId.ToString()),
            name = (string)row.Name,
            mediaType = (string)row.MediaType,
            extension = (string)row.Extension,
            sizeBytes = sizeMap.TryGetValue((int)row.Id, out var size) ? size : 0L
        }).ToList();

        return Ok(new { results, totalCount, page, pageSize });
    }
}
