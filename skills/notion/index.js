const axios = require('axios');

const SETUP = '⚙️ Notion not configured. Set NOTION_API_KEY.\nGet from: https://www.notion.so/my-integrations';

function headers() {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error('MISSING_ENV');
  return { Authorization: `Bearer ${key}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
}

function extractText(richText) {
  if (!richText || !Array.isArray(richText)) return '';
  return richText.map(t => t.plain_text || '').join('');
}

async function run({ action, query, pageId, title, content, parentId, databaseId, filter, properties }) {
  try {
    if (action === 'search') {
      if (!query) return 'Provide a search query';
      const { data } = await axios.post('https://api.notion.com/v1/search',
        { query, page_size: 10 }, { headers: headers() });
      if (!data.results?.length) return `No results for "${query}"`;
      const lines = data.results.map(r => {
        const title = r.properties?.title ? extractText(r.properties.title.title) :
                      r.properties?.Name ? extractText(r.properties.Name.title) : r.id;
        return `📄 ${title || '(Untitled)'}\n   Type: ${r.object} · ID: ${r.id}`;
      });
      return `🔍 Notion: "${query}"\n\n` + lines.join('\n\n');
    }

    if (action === 'page_get') {
      if (!pageId) return 'Provide pageId';
      const [page, blocks] = await Promise.all([
        axios.get(`https://api.notion.com/v1/pages/${pageId}`, { headers: headers() }),
        axios.get(`https://api.notion.com/v1/blocks/${pageId}/children`, { headers: headers() })
      ]);
      const pageTitle = page.data.properties?.title ? extractText(page.data.properties.title.title) : pageId;
      const blockText = blocks.data.results.slice(0, 20).map(b => {
        const type = b.type;
        const tc = b[type];
        if (tc?.rich_text) return extractText(tc.rich_text);
        return '';
      }).filter(Boolean).join('\n');
      return `📄 ${pageTitle}\n\n${blockText || '(empty page)'}`;
    }

    if (action === 'page_create') {
      if (!title) return 'Provide title';
      const parent = parentId
        ? { type: 'page_id', page_id: parentId }
        : { type: 'workspace' };
      const body = {
        parent,
        properties: { title: { title: [{ text: { content: title } }] } },
        children: content ? [{
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ text: { content: content } }] }
        }] : []
      };
      const { data } = await axios.post('https://api.notion.com/v1/pages', body, { headers: headers() });
      return `✅ Page created: ${title}\n🔗 ${data.url}`;
    }

    if (action === 'db_query') {
      if (!databaseId) return 'Provide databaseId';
      const body = filter ? { filter: typeof filter === 'string' ? JSON.parse(filter) : filter, page_size: 10 } : { page_size: 10 };
      const { data } = await axios.post(`https://api.notion.com/v1/databases/${databaseId}/query`, body, { headers: headers() });
      if (!data.results?.length) return 'No records found.';
      const lines = data.results.slice(0, 10).map((r, i) => {
        const props = Object.entries(r.properties).slice(0, 3).map(([k, v]) => {
          if (v.title) return `${k}: ${extractText(v.title)}`;
          if (v.rich_text) return `${k}: ${extractText(v.rich_text)}`;
          if (v.number) return `${k}: ${v.number}`;
          if (v.select) return `${k}: ${v.select?.name || ''}`;
          if (v.date) return `${k}: ${v.date?.start || ''}`;
          return `${k}: —`;
        }).join(' | ');
        return `${i + 1}. ${props}`;
      });
      return `📋 Database (${data.results.length} records):\n\n` + lines.join('\n');
    }

    if (action === 'db_add') {
      if (!databaseId || !properties) return 'Provide databaseId and properties (JSON)';
      const props = typeof properties === 'string' ? JSON.parse(properties) : properties;
      const { data } = await axios.post('https://api.notion.com/v1/pages',
        { parent: { database_id: databaseId }, properties: props }, { headers: headers() });
      return `✅ Record added to database\nID: ${data.id}`;
    }

    return `Unknown action "${action}". Available: search, page_get, page_create, db_query, db_add`;
  } catch (err) {
    if (err.message === 'MISSING_ENV') return SETUP;
    return `Notion error: ${err.response?.data?.message || err.message}`;
  }
}

module.exports = { run };
