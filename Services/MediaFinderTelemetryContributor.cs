using System;
using DigitalWonderlab.Telemetry;
using Microsoft.Extensions.Configuration;
using Umbraco.Cms.Core;
using Umbraco.Cms.Infrastructure.Scoping;

namespace DigitalWonderlab.MediaFinder;

/// <summary>
/// What Media Finder reports in its anonymous daily heartbeat: the media library's rough size (banded) and how
/// many searches were run in the last day (banded). See README "Telemetry".
/// </summary>
internal sealed class MediaFinderTelemetryContributor : ITelemetryContributor
{
    public const string Product = "media-finder";
    public const string Searches = "searches";

    private readonly IScopeProvider _scopeProvider;
    private readonly TelemetryPayloadBuilder _builder;
    private readonly TelemetryCounters _counters;
    private readonly IConfiguration _configuration;

    public MediaFinderTelemetryContributor(IScopeProvider scopeProvider, TelemetryPayloadBuilder builder,
        TelemetryCounters counters, IConfiguration configuration)
    {
        _scopeProvider = scopeProvider;
        _builder = builder;
        _counters = counters;
        _configuration = configuration;
    }

    public string ProductId => Product;

    public string? PackageVersion => TelemetryPayloadBuilder.VersionOf(typeof(MediaFinderTelemetryContributor).Assembly);

    public bool IsEnabled()
        => _configuration.GetValue<bool?>("MediaFinder:Telemetry:Enabled") != false
           && _builder.IsProductToggleOn(Product);

    public void Contribute(TelemetryReport report)
    {
        using (var scope = _scopeProvider.CreateScope(autoComplete: true))
        {
            var media = scope.Database.ExecuteScalar<long>(
                "SELECT COUNT(*) FROM umbracoNode WHERE nodeObjectType = @0 AND trashed = 0", Constants.ObjectTypes.Media);
            report.SizeBand["media"] = TelemetryBand.Of(media);
        }
        _counters.AddTo(report, Searches);
    }
}
