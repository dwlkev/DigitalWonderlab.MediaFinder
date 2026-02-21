import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";

export default class MediaFinderDashboard extends UmbElementMixin(HTMLElement) {
    /** @type {import('@umbraco-cms/backoffice/notification').UmbNotificationContext} */
    #notificationContext;
    #currentPage = 1;
    #pageSize = 20;
    #sortBy = "name";
    #sortDir = "asc";
    #totalCount = 0;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.loadTemplate();
        this.loadStyles();
    }

    async loadTemplate() {
        const response = await fetch("/App_Plugins/MediaFinder/media-finder-template.html");
        const templateText = await response.text();
        const template = document.createElement("template");
        template.innerHTML = templateText;
        this.shadowRoot.appendChild(template.content.cloneNode(true));
        this.afterTemplateLoaded();
    }

    loadStyles() {
        const style = document.createElement("link");
        style.setAttribute("rel", "stylesheet");
        style.setAttribute("href", "/App_Plugins/MediaFinder/media-finder-style.css");
        this.shadowRoot.appendChild(style);
    }

    afterTemplateLoaded() {
        this.shadowRoot.getElementById("searchBtn").addEventListener("click", () => {
            this.#currentPage = 1;
            this.performSearch();
        });

        this.shadowRoot.querySelectorAll('input[name="searchType"]').forEach((radio) => {
            radio.addEventListener("change", (e) => this.onSearchTypeChange(e.target.value));
        });

        this.shadowRoot.querySelectorAll('input[type="text"], input[type="number"]').forEach((input) => {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    this.#currentPage = 1;
                    this.performSearch();
                }
            });
        });

        // Sortable column headers
        this.shadowRoot.querySelectorAll("th.sortable").forEach((th) => {
            th.addEventListener("click", () => {
                const col = th.getAttribute("data-sort");
                if (this.#sortBy === col) {
                    this.#sortDir = this.#sortDir === "asc" ? "desc" : "asc";
                } else {
                    this.#sortBy = col;
                    this.#sortDir = "asc";
                }
                this.#currentPage = 1;
                this.performSearch();
            });
        });

        // Pagination buttons
        this.shadowRoot.getElementById("prevPage").addEventListener("click", () => {
            if (this.#currentPage > 1) {
                this.#currentPage--;
                this.performSearch();
            }
        });
        this.shadowRoot.getElementById("nextPage").addEventListener("click", () => {
            const totalPages = Math.ceil(this.#totalCount / this.#pageSize);
            if (this.#currentPage < totalPages) {
                this.#currentPage++;
                this.performSearch();
            }
        });

        this.consumeContext(UMB_NOTIFICATION_CONTEXT, (instance) => {
            this.#notificationContext = instance;
        });
    }

    onSearchTypeChange(type) {
        const nameInput = this.shadowRoot.getElementById("nameSearchInput");
        const sizeInput = this.shadowRoot.getElementById("sizeSearchInput");
        const typeInput = this.shadowRoot.getElementById("typeSearchInput");

        nameInput.style.display = type === "name" ? "" : "none";
        sizeInput.style.display = type === "size" ? "" : "none";
        typeInput.style.display = type === "type" ? "" : "none";
    }

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const value = bytes / Math.pow(1024, i);
        return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    }

    updateSortIndicators() {
        this.shadowRoot.querySelectorAll("th.sortable").forEach((th) => {
            const arrow = th.querySelector(".sort-arrow");
            const col = th.getAttribute("data-sort");
            if (col === this.#sortBy) {
                arrow.textContent = this.#sortDir === "asc" ? " \u25B2" : " \u25BC";
                th.classList.add("sorted");
            } else {
                arrow.textContent = "";
                th.classList.remove("sorted");
            }
        });
    }

    updatePagination() {
        const totalPages = Math.max(1, Math.ceil(this.#totalCount / this.#pageSize));
        const start = (this.#currentPage - 1) * this.#pageSize + 1;
        const end = Math.min(this.#currentPage * this.#pageSize, this.#totalCount);

        this.shadowRoot.getElementById("pageInfo").textContent =
            `Showing ${start}-${end} of ${this.#totalCount} | Page ${this.#currentPage} of ${totalPages}`;
        this.shadowRoot.getElementById("prevPage").disabled = this.#currentPage <= 1;
        this.shadowRoot.getElementById("nextPage").disabled = this.#currentPage >= totalPages;
    }

    async performSearch() {
        const searchType = this.shadowRoot.querySelector('input[name="searchType"]:checked')?.value;
        if (!searchType) return;

        let url = `/umbraco/api/mediafinder/search?searchType=${searchType}`;
        url += `&page=${this.#currentPage}&pageSize=${this.#pageSize}`;
        url += `&orderBy=${this.#sortBy}&orderDir=${this.#sortDir}`;

        if (searchType === "name") {
            const query = this.shadowRoot.getElementById("queryInput").value.trim();
            if (!query) {
                this.#notificationContext?.peek("warning", {
                    data: { headline: "Missing search term", message: "Please enter a file name to search for." },
                });
                return;
            }
            url += `&query=${encodeURIComponent(query)}`;
        } else if (searchType === "size") {
            const minMB = parseFloat(this.shadowRoot.getElementById("minSizeInput").value);
            const maxMB = parseFloat(this.shadowRoot.getElementById("maxSizeInput").value);
            if (isNaN(minMB) && isNaN(maxMB)) {
                this.#notificationContext?.peek("warning", {
                    data: { headline: "Missing size range", message: "Please enter at least a minimum or maximum size." },
                });
                return;
            }
            if (!isNaN(minMB)) url += `&minSize=${Math.round(minMB * 1024 * 1024)}`;
            if (!isNaN(maxMB)) url += `&maxSize=${Math.round(maxMB * 1024 * 1024)}`;
        } else if (searchType === "type") {
            const query = this.shadowRoot.getElementById("typeInput").value.trim();
            if (!query) {
                this.#notificationContext?.peek("warning", {
                    data: { headline: "Missing file type", message: "Please enter a file type to search for." },
                });
                return;
            }
            url += `&query=${encodeURIComponent(query)}`;
        }

        const resultsSection = this.shadowRoot.getElementById("resultsSection");
        const noResults = this.shadowRoot.getElementById("noResults");
        const loading = this.shadowRoot.getElementById("loadingIndicator");

        resultsSection.style.display = "none";
        noResults.style.display = "none";
        loading.style.display = "";

        try {
            const response = await fetch(url);
            const data = await response.json();

            loading.style.display = "none";

            if (!response.ok) {
                this.#notificationContext?.peek("danger", {
                    data: { headline: "Search failed", message: data.error || "An error occurred." },
                });
                return;
            }

            this.#totalCount = data.totalCount || 0;

            if (!data.results || data.results.length === 0) {
                if (this.#currentPage > 1) {
                    this.#currentPage = 1;
                    this.performSearch();
                    return;
                }
                noResults.style.display = "";
                return;
            }

            const tbody = this.shadowRoot.getElementById("resultsBody");
            tbody.innerHTML = "";

            data.results.forEach((item) => {
                const tr = document.createElement("tr");
                const mediaLink = `/umbraco/section/media/workspace/media/edit/${item.uniqueId}`;

                tr.innerHTML = `
                    <td>${this.escapeHtml(item.name)}</td>
                    <td>${this.escapeHtml(item.extension || item.mediaType)}</td>
                    <td>${this.formatBytes(item.sizeBytes)}</td>
                    <td><a href="${mediaLink}">Open</a></td>
                `;
                tbody.appendChild(tr);
            });

            this.shadowRoot.getElementById("resultCount").textContent = `(${this.#totalCount} found)`;
            this.updateSortIndicators();
            this.updatePagination();
            resultsSection.style.display = "";

        } catch (error) {
            loading.style.display = "none";
            console.error("Media search failed", error);
            this.#notificationContext?.peek("danger", {
                data: { headline: "Search error", message: "Please check the API connection." },
            });
        }
    }

    escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }
}

customElements.define("media-finder-dashboard", MediaFinderDashboard);
