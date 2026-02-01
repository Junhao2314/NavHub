import { describe, expect, it } from 'vitest';
import { parseBookmarks } from './bookmarkParser';

describe('parseBookmarks', () => {
  it('filters non-http(s) bookmark URLs', async () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><A HREF="https://example.com">Example</A>
  <DT><A HREF="javascript:alert(1)">Bad JS</A>
  <DT><A HREF="data:text/html,hello">Bad Data</A>
  <DT><A HREF="chrome://settings">Chrome</A>
  <DT><A HREF="about:blank">About</A>
</DL><p>`;

    const file = { text: async () => html } as any;
    const result = await parseBookmarks(file);

    expect(result.links.map((l) => l.url)).toEqual(['https://example.com']);
    expect(result.categories).toEqual([]);
    expect(result.links[0]?.categoryId).toBe('common');
  });
});
