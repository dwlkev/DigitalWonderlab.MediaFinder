(function (w) {

    function init(root) {
        var q = function (sel) { return root.querySelector(sel); };
        var byId = function (id) { return root.querySelector("#" + id); };

        var currentPage = 1;
        var pageSize = 20;
        var sortBy = "name";
        var sortDir = "asc";
        var totalCount = 0;

        function formatBytes(bytes) {
            if (!bytes || bytes === 0) return "0 B";
            var units = ["B", "KB", "MB", "GB", "TB"];
            var i = Math.floor(Math.log(bytes) / Math.log(1024));
            var value = bytes / Math.pow(1024, i);
            return value.toFixed(i === 0 ? 0 : 1) + " " + units[i];
        }

        function escapeHtml(str) {
            var div = document.createElement("div");
            div.textContent = str;
            return div.innerHTML;
        }

        function onSearchTypeChange(type) {
            var nameInput = byId("nameSearchInput");
            var sizeInput = byId("sizeSearchInput");
            var typeInput = byId("typeSearchInput");

            nameInput.style.display = type === "name" ? "" : "none";
            sizeInput.style.display = type === "size" ? "" : "none";
            typeInput.style.display = type === "type" ? "" : "none";
        }

        function updateSortIndicators() {
            root.querySelectorAll("th.sortable").forEach(function (th) {
                var arrow = th.querySelector(".sort-arrow");
                var col = th.getAttribute("data-sort");
                if (col === sortBy) {
                    arrow.textContent = sortDir === "asc" ? " \u25B2" : " \u25BC";
                    th.classList.add("sorted");
                } else {
                    arrow.textContent = "";
                    th.classList.remove("sorted");
                }
            });
        }

        function updatePagination() {
            var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
            var start = (currentPage - 1) * pageSize + 1;
            var end = Math.min(currentPage * pageSize, totalCount);

            byId("pageInfo").textContent =
                "Showing " + start + "-" + end + " of " + totalCount + " | Page " + currentPage + " of " + totalPages;
            byId("prevPage").disabled = currentPage <= 1;
            byId("nextPage").disabled = currentPage >= totalPages;
        }

        async function performSearch() {
            var searchTypeEl = root.querySelector('input[name="searchType"]:checked');
            var searchType = searchTypeEl ? searchTypeEl.value : null;
            if (!searchType) return;

            var url = "/umbraco/api/mediafinder/search?searchType=" + searchType;
            url += "&page=" + currentPage + "&pageSize=" + pageSize;
            url += "&orderBy=" + sortBy + "&orderDir=" + sortDir;

            if (searchType === "name") {
                var query = byId("queryInput").value.trim();
                if (!query) { alert("Please enter a file name to search for."); return; }
                url += "&query=" + encodeURIComponent(query);
            } else if (searchType === "size") {
                var minMB = parseFloat(byId("minSizeInput").value);
                var maxMB = parseFloat(byId("maxSizeInput").value);
                if (isNaN(minMB) && isNaN(maxMB)) { alert("Please enter at least a minimum or maximum size."); return; }
                if (!isNaN(minMB)) url += "&minSize=" + Math.round(minMB * 1024 * 1024);
                if (!isNaN(maxMB)) url += "&maxSize=" + Math.round(maxMB * 1024 * 1024);
            } else if (searchType === "type") {
                var typeQuery = byId("typeInput").value.trim();
                if (!typeQuery) { alert("Please enter a file type to search for."); return; }
                url += "&query=" + encodeURIComponent(typeQuery);
            }

            var resultsSection = byId("resultsSection");
            var noResults = byId("noResults");
            var loading = byId("loadingIndicator");

            resultsSection.style.display = "none";
            noResults.style.display = "none";
            loading.style.display = "";

            try {
                var res = await fetch(url, { headers: { "x-requested-with": "XMLHttpRequest" } });
                var data = await res.json();

                loading.style.display = "none";

                if (!res.ok) {
                    alert(data.error || "Search failed.");
                    return;
                }

                totalCount = data.totalCount || 0;

                if (!data.results || data.results.length === 0) {
                    if (currentPage > 1) {
                        currentPage = 1;
                        performSearch();
                        return;
                    }
                    noResults.style.display = "";
                    return;
                }

                var tbody = byId("resultsBody");
                tbody.innerHTML = "";

                data.results.forEach(function (item) {
                    var tr = document.createElement("tr");
                    var mediaLink = "/umbraco/#/media/media/edit/" + item.id;

                    tr.innerHTML =
                        "<td>" + escapeHtml(item.name) + "</td>" +
                        "<td>" + escapeHtml(item.extension || item.mediaType) + "</td>" +
                        "<td>" + formatBytes(item.sizeBytes) + "</td>" +
                        '<td><a href="' + mediaLink + '">Open</a></td>';
                    tbody.appendChild(tr);
                });

                byId("resultCount").textContent = "(" + totalCount + " found)";
                updateSortIndicators();
                updatePagination();
                resultsSection.style.display = "";

            } catch (e) {
                loading.style.display = "none";
                console.error("Media search failed", e);
                alert("Search failed. Please check the API connection.");
            }
        }

        // Bind search type radio buttons
        root.querySelectorAll('input[name="searchType"]').forEach(function (radio) {
            radio.addEventListener("change", function (e) { onSearchTypeChange(e.target.value); });
        });

        // Bind search button
        byId("searchBtn")?.addEventListener("click", function () {
            currentPage = 1;
            performSearch();
        });

        // Bind Enter key on text/number inputs
        root.querySelectorAll('input[type="text"], input[type="number"]').forEach(function (input) {
            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter") { currentPage = 1; performSearch(); }
            });
        });

        // Bind sortable column headers
        root.querySelectorAll("th.sortable").forEach(function (th) {
            th.addEventListener("click", function () {
                var col = th.getAttribute("data-sort");
                if (sortBy === col) {
                    sortDir = sortDir === "asc" ? "desc" : "asc";
                } else {
                    sortBy = col;
                    sortDir = "asc";
                }
                currentPage = 1;
                performSearch();
            });
        });

        // Bind pagination buttons
        byId("prevPage")?.addEventListener("click", function () {
            if (currentPage > 1) { currentPage--; performSearch(); }
        });
        byId("nextPage")?.addEventListener("click", function () {
            var totalPages = Math.ceil(totalCount / pageSize);
            if (currentPage < totalPages) { currentPage++; performSearch(); }
        });
    }

    w.MediaFinderV13 = { init: init };
})(window);
