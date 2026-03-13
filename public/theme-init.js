(function () {
  var storageKey = "ratisa_theme_preference";
  var mediaQuery =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  var storedPreference = "system";

  try {
    var storedValue = window.localStorage.getItem(storageKey);
    if (
      storedValue === "light" ||
      storedValue === "dark" ||
      storedValue === "system"
    ) {
      storedPreference = storedValue;
    }
  } catch (error) {}

  var resolvedTheme =
    storedPreference === "system"
      ? mediaQuery && mediaQuery.matches
        ? "dark"
        : "light"
      : storedPreference;

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;

  var themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute(
      "content",
      resolvedTheme === "dark" ? "#101820" : "#F3F1EC",
    );
  }
})();
