(function () {
    "use strict";
    angular.module("umbraco").controller("MediaFinderV13Controller", function ($element, $timeout) {
        $timeout(function () {
            if (window.MediaFinderV13 && typeof window.MediaFinderV13.init === "function") {
                window.MediaFinderV13.init($element[0]);
            }
        }, 0);
    });
})();
