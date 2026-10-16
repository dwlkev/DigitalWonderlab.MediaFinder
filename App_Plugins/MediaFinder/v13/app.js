(function (w) {

    function init(root) {
        var q = function (sel) { return root.querySelector(sel); };
        var byId = function (id) { return root.querySelector("#" + id); };

        var currentPage = 1;
        var pageSize = 20;
        var sortBy = "name";
        var sortDir = "asc";
        var totalCount = 0;
        var lastSearchResults = [];

        function formatBytes(bytes) {
            if (!bytes || bytes === 0) return "0 B";
            var units = ["B", "KB", "MB", "GB", "TB"];
            var i = Math.floor(Math.log(bytes) / Math.log(1024));
            var value = bytes / Math.pow(1024, i);
            return value.toFixed(i === 0 ? 0 : 1) + " " + units[i];
        }

        function escapeHtml(str) {
            // Escapes quotes too: the result is also used inside title="" and href="" attributes.
            return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
        }

        function formatDate(dateStr) {
            var d = new Date(dateStr);
            var yyyy = d.getFullYear();
            var mm = String(d.getMonth() + 1).padStart(2, "0");
            var dd = String(d.getDate()).padStart(2, "0");
            return yyyy + "-" + mm + "-" + dd;
        }

        function formatDimensions(width, height) {
            if (width && height) return width + "×" + height;
            if (width) return width + "w";
            if (height) return height + "h";
            return "—";
        }

        function formatPath(pathStr) {
            if (!pathStr) return "—";
            var parts = pathStr.split(",").filter(function (p) { return p !== "-1"; });
            return parts.join(" › ");
        }

        function escapeCsv(value) {
            if (value == null) return "";
            var str = String(value);
            if (str.indexOf(",") >= 0 || str.indexOf('"') >= 0 || str.indexOf("\n") >= 0) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }

        function getExportFilename() {
            var d = new Date();
            var yyyy = d.getFullYear();
            var mm = String(d.getMonth() + 1).padStart(2, "0");
            var dd = String(d.getDate()).padStart(2, "0");
            return "media-finder-export-" + yyyy + "-" + mm + "-" + dd + ".csv";
        }

        function exportCsv() {
            if (!lastSearchResults || lastSearchResults.length === 0) {
                return;
            }

            var rows = [["File Name", "Type", "Size (bytes)", "Width", "Height", "Created Date", "Node Path", "Server URL"]];

            lastSearchResults.forEach(function (item) {
                rows.push([
                    escapeCsv(item.name),
                    escapeCsv(item.extension || item.mediaType),
                    escapeCsv(item.sizeBytes || 0),
                    escapeCsv(item.width || ""),
                    escapeCsv(item.height || ""),
                    escapeCsv(formatDate(item.createDate)),
                    escapeCsv(formatPath(item.path)),
                    escapeCsv(item.filePath || "")
                ]);
            });

            var csv = rows.map(function (r) { return r.join(","); }).join("\r\n") + "\r\n";
            var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = getExportFilename();
            a.style.display = "none";
            a.addEventListener("click", function (e) { e.stopPropagation(); });
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 150);
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

            var url = "/umbraco/backoffice/mediafinder/search?searchType=" + searchType;
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
                var res = await fetch(url, { credentials: "same-origin", headers: { "x-requested-with": "XMLHttpRequest" } });
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

                lastSearchResults = data.results;

                var tbody = byId("resultsBody");
                tbody.innerHTML = "";

                data.results.forEach(function (item) {
                    var tr = document.createElement("tr");
                    var mediaLink = "/umbraco/#/media/media/edit/" + item.id;
                    var serverLink = item.filePath ? item.filePath : "";

                    tr.innerHTML =
                        "<td>" + escapeHtml(item.name) + "</td>" +
                        "<td>" + escapeHtml(item.extension || item.mediaType) + "</td>" +
                        "<td>" + formatBytes(item.sizeBytes) + "</td>" +
                        "<td>" + formatDimensions(item.width, item.height) + "</td>" +
                        "<td>" + formatDate(item.createDate) + "</td>" +
                        '<td title="' + escapeHtml(item.filePath) + '">' + formatPath(item.path) + "</td>" +
                        '<td><a href="' + mediaLink + '" target="_blank">Open</a></td>' +
                        "<td>" + (serverLink ? '<a href="' + escapeHtml(serverLink) + '" target="_blank">View</a>' : "—") + "</td>";
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

        // Bind CSV export button
        byId("exportCsv")?.addEventListener("click", function () { exportCsv(); });

        // Search | Settings switch and the anonymous telemetry toggle + preview (1.5.0).
        // Requests go with the backoffice cookie (same-origin), which the API requires since 1.5.0.
        (function wireSettings() {
            var api = function (path, init) {
                init = init || {};
                init.credentials = "same-origin";
                init.headers = Object.assign({ "x-requested-with": "XMLHttpRequest" }, init.headers || {});
                return fetch("/umbraco/backoffice/mediafinder/" + path, init);
            };
            var toggle = byId("dwl-telemetry-enabled");
            var status = byId("dwl-telemetry-status");
            var preview = byId("dwl-telemetry-preview");
            var box = byId("dwl-telemetry-preview-box");
            var wrapper = q(".media-finder-wrapper") || root;
            if (!toggle || !preview || !box) return;

            function loadPreview() {
                api("telemetry/preview").then(function (r) {
                    if (!r.ok) throw new Error("HTTP " + r.status);
                    return r.json();
                }).then(function (d) {
                    var state = !d.enabled ? "Telemetry is off, so nothing is sent."
                        : !d.environmentAllowed ? "This is a Development environment, so nothing is sent."
                        : "Sent once a day to " + d.endpoint;
                    preview.textContent = state + "\n\n" + JSON.stringify(d.payload, null, 2);
                }).catch(function (e) { preview.textContent = "Could not load the preview (" + e.message + ")."; });
            }
            function loadToggle() {
                api("telemetry").then(function (r) {
                    if (!r.ok) throw new Error("HTTP " + r.status);
                    return r.json();
                }).then(function (d) {
                    toggle.checked = d.enabled !== false;
                    status.textContent = toggle.checked ? "Telemetry is on." : "Telemetry is off.";
                }).catch(function (e) { status.textContent = "Could not load the setting (" + e.message + ")."; });
            }

            root.querySelectorAll("uui-tab[data-dwl-view]").forEach(function (tab) {
                tab.addEventListener("click", function () {
                    var settings = tab.getAttribute("data-dwl-view") === "settings";
                    root.querySelectorAll("uui-tab[data-dwl-view]").forEach(function (t) { t.active = t === tab; });
                    wrapper.classList.toggle("dwl-show-settings", settings);
                    if (settings) loadToggle();
                });
            });
            toggle.addEventListener("change", function () {
                api("telemetry", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled: toggle.checked })
                }).then(function (r) {
                    if (!r.ok) throw new Error("HTTP " + r.status);
                    status.textContent = toggle.checked ? "Telemetry is on." : "Telemetry is off.";
                    if (box.open) loadPreview();
                }).catch(function (e) {
                    status.textContent = "Could not save (" + e.message + ").";
                    toggle.checked = !toggle.checked;
                });
            });
            box.addEventListener("toggle", function () { if (box.open) loadPreview(); });
        })();

    }

    w.MediaFinderV13 = { init: init };
})(window);
