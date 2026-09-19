/**
 * /blog/rss.xml — the field-notes feed. Uses the same publishedFilter as the
 * index + getStaticPaths so drafts can never leak. (An extensioned endpoint —
 * unaffected by trailingSlash: 'always'.)
 */
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { site } from '../../data/site';
import { publishedFilter, sortByPublished } from '../../data/blog';

export async function GET(context: APIContext) {
  const entries = (await getCollection('blog', publishedFilter)).sort(sortByPublished);
  return rss({
    title: `${site.name} — Field notes`,
    description: 'The build, in public — field notes from the workbench.',
    site: context.site!,
    customData: '<language>en-us</language>',
    items: entries.map((e) => ({
      title: e.data.title,
      description: e.data.description,
      pubDate: e.data.publishedAt,
      link: `/blog/${e.id}/`,
    })),
  });
}
