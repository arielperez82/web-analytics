export type LinkType = string | 'email' | 'media' | 'social' | 'web'

export interface LinkClickProperties {
  link_url: string
  link_text: string
  link_host: string
  link_path: string
  link_params: string
  link_hash: string
  link_type: LinkType
  is_external: boolean
}

export interface EmailClickProperties extends LinkClickProperties {
  email_address: string
  email_subject: string | null
  email_body: string | null
}

export interface SocialClickProperties extends LinkClickProperties {
  platform: string
}

export type TrackingProperties =
  EmailClickProperties | LinkClickProperties | Record<string, unknown> | SocialClickProperties

type PropertyGenerator = (
  link: HTMLAnchorElement
) =>
  EmailClickProperties | LinkClickProperties | Record<string, unknown> | SocialClickProperties

const getPlatformFromHostname = (hostname: string) => {
  if (hostname.includes('podcasts.apple')) return 'apple-podcasts'
  if (hostname.includes('spotify')) return 'spotify'
  if (hostname.includes('substack')) return 'substack'
  if (hostname.includes('music.amazon')) return 'amazon-music'
  return hostname.replace(/www\./, '').replace(/\.com$/, '')
}

const linkClickPropertyGenerator = (
  link: HTMLAnchorElement,
  linkType: LinkType = 'web'
): LinkClickProperties => {
  const url = new URL(link.href, window.location.origin)
  const mappedSearchParams = new URLSearchParams()
  url.searchParams.forEach((value, key) => {
    mappedSearchParams.set(key, decodeURIComponent(value))
  })

  return {
    link_url: link.href,
    link_text: link.textContent?.trim() || '',
    link_host: url.hostname,
    link_path: url.pathname,
    link_params: mappedSearchParams.toString(),
    link_hash: url.hash.substring(1),
    link_type: linkType,
    is_external: url.hostname !== window.location.hostname
  }
}

class EventPropertyFactory {
  private generators = new Map<LinkType, PropertyGenerator>([
    ['web', (link: HTMLAnchorElement) => linkClickPropertyGenerator(link, 'web')],
    [
      'email',
      (link: HTMLAnchorElement): EmailClickProperties => {
        const url = new URL(link.href)
        return {
          ...linkClickPropertyGenerator(link, 'email'),
          email_address: url.pathname,
          email_subject: url.searchParams.get('subject') || null,
          email_body: url.searchParams.get('body') || null
        }
      }
    ],

    [
      'social',
      (link: HTMLAnchorElement): SocialClickProperties => {
        const url = new URL(link.href, window.location.origin)
        return {
          ...linkClickPropertyGenerator(link, 'social'),
          platform: getPlatformFromHostname(url.hostname)
        }
      }
    ],

    [
      'media',
      (link: HTMLAnchorElement): SocialClickProperties => {
        const url = new URL(link.href, window.location.origin)

        return {
          ...linkClickPropertyGenerator(link, 'media'),
          platform: getPlatformFromHostname(url.hostname)
        }
      }
    ]
  ])

  createGenerator(linkType: LinkType): PropertyGenerator {
    return this.generators.get(linkType) || ((link: HTMLAnchorElement) => linkClickPropertyGenerator(link, linkType))
  }

  register(eventType: string, generator: PropertyGenerator): void {
    this.generators.set(eventType, generator)
  }
}

export const eventPropertyFactory = new EventPropertyFactory()
