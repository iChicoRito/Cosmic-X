export function bindBigBangNavigation({ root, navigate, listen }) {
  for (const id of ['backLink', 'bbEndingBack']) {
    const link = root.querySelector(`#${id}`);
    listen(link, 'click', event => {
      event.preventDefault();
      navigate('/modes');
    });
  }
}
