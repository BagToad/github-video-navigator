(() => {
  const parameters = new URLSearchParams(window.location.search);
  document.documentElement.classList.toggle(
    'has-recording',
    parameters.has('url') || parameters.get('demo') === '1',
  );
})();
