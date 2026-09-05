/**
 * /podcast/rss.xml — the podcast feed submitted to Apple and Spotify.
 *
 * NOT the blog's plain RSS: podcast directories require the iTunes namespace and a
 * per-item <enclosure> pointing at the real audio file. @astrojs/rss supports both
 * (channel `xmlns` + `customData`, per-item `customData`, first-class `enclosure`),
 * so this needs no extra dependency.
 *
 * Two things to keep in mind when editing:
 *  - `customData` is re-parsed by @astrojs/rss (XMLParser then XMLBuilder), not spliced
 *    verbatim — but it must be well-formed going IN, so every interpolated value goes
 *    through xmlEscape() first. Episode titles are machine-generated, and one stray
 *    `&` makes the fragment unparseable and the feed malformed.
 *  - Do NOT add a <guid>. @astrojs/rss already emits one from the item link.
 */
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import {
  publishedFilter, sortByPublished, xmlEscape,
  SHOW, HOST, SHOW_SUBTITLE, SHOW_DESCRIPTION, OWNER_EMAIL, COVER_PATH, CATEGORY,
} from '../../data/podcast';

export async function GET(context: APIContext) {
  const entries = (await getCollection('podcast', publishedFilter)).sort(sortByPublished);
  const origin = new URL(context.site!).origin;

  const showUrl = `${origin}/podcast/`;
  const feedUrl = `${origin}/podcast/rss.xml`;

  return rss({
    title: SHOW,
    description: SHOW_DESCRIPTION,
    // `site` becomes the channel <link>, which directories show as "the podcast's
    // website" — that's the show page, not the site root. Item links below are
    // absolute so this narrower base can't be prepended to them.
    site: showUrl,
    xmlns: {
      itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
      atom: 'http://www.w3.org/2005/Atom',
      // Podcasting 2.0 — carries <podcast:transcript>, which Apple now ingests to
      // show in-app transcripts. We already have the transcript at a stable URL.
      podcast: 'https://podcastindex.org/namespace/1.0',
    },
    customData: [
      '<language>en-us</language>',
      // Feed validators flag a missing self-reference; it also tells a directory
      // where to re-fetch if the feed is ever proxied.
      `<atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml"/>`,
      // The HOST, not the show — Apple renders this as the artist line, so the show
      // would otherwise display as "AI From the Floor — by AI From the Floor".
      `<itunes:author>${xmlEscape(HOST)}</itunes:author>`,
      `<itunes:subtitle>${xmlEscape(SHOW_SUBTITLE)}</itunes:subtitle>`,
      `<itunes:summary>${xmlEscape(SHOW_DESCRIPTION)}</itunes:summary>`,
      `<itunes:owner><itunes:name>${xmlEscape(SHOW)}</itunes:name>` +
        `<itunes:email>${xmlEscape(OWNER_EMAIL)}</itunes:email></itunes:owner>`,
      `<itunes:image href="${xmlEscape(origin + COVER_PATH)}"/>`,
      `<itunes:category text="${xmlEscape(CATEGORY)}"/>`,
      '<itunes:explicit>false</itunes:explicit>',
      '<itunes:type>episodic</itunes:type>',
    ].join(''),
    items: entries.map((e) => ({
      title: e.data.title,
      description: e.data.description,
      pubDate: e.data.publishedAt,
      // Absolute: `site` is the show page, so a relative link would nest wrongly.
      // This is also the <guid>, which must stay byte-stable forever — a changed
      // guid makes every podcast app re-download the episode as if it were new.
      link: `${origin}/podcast/${e.id}/`,
      // The whole point of a podcast feed: where the audio actually lives.
      enclosure: {
        url: e.data.audioUrl,
        length: e.data.audioBytes,
        type: 'audio/mpeg',
      },
      customData: [
        `<itunes:title>${xmlEscape(e.data.title)}</itunes:title>`,
        `<itunes:subtitle>${xmlEscape(e.data.subtitle)}</itunes:subtitle>`,
        `<itunes:summary>${xmlEscape(e.data.description)}</itunes:summary>`,
        `<itunes:author>${xmlEscape(HOST)}</itunes:author>`,
        `<itunes:duration>${xmlEscape(e.data.duration)}</itunes:duration>`,
        '<itunes:episodeType>full</itunes:episodeType>',
        '<itunes:explicit>false</itunes:explicit>',
        // The episode page IS the transcript document; podcast apps that support the
        // tag link to it rather than us hosting a second copy in another format.
        `<podcast:transcript url="${xmlEscape(`${origin}/podcast/${e.id}/`)}" type="text/html"/>`,
      ].join(''),
    })),
  });
}
