// The CMS is the only source of public project and image content.
export function normalizePortfolio(data) {
  const publicImages = (data.images || []).filter(image => image.published && !image.archived && image.url);
  return (data.projects || [])
    .filter(project => project.published)
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
    .map(project => ({
      ...project,
      images: publicImages.filter(image => (image.project_ids || []).includes(project.id)),
    }))
    .filter(project => project.images.length);
}

export async function loadPortfolio() {
  const response = await fetch('/api/public', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load portfolio (${response.status})`);
  const data = await response.json();
  return { projects: normalizePortfolio(data), settings: data.settings || {} };
}
