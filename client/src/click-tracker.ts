// src/scripts/analytics/click-tracker.ts
import { eventPropertyFactory, type LinkType } from './event-property-factory'

const socialPlatforms = [
  'linkedin.com',
  'twitter.com',
  'github.com',
  'x.com',
  'instagram.com',
  'facebook.com'
]
const mediaPlatforms = [
  'substack.com',
  'medium.com',
  'podcasts.apple.com',
  'music.amazon.com',
  'spotify.com',
  'youtube.com'
]

const inferLinkType = (url: string): LinkType => {
  const fullUrl = new URL(url)
  const linkType =
    fullUrl.protocol === 'mailto:'
      ? 'email'
      : socialPlatforms.some((p) => fullUrl.hostname.includes(p))
        ? 'social'
        : mediaPlatforms.some((p) => fullUrl.hostname.includes(p))
          ? 'media'
          : 'web'
  return linkType
}

// Collect all tracking data attributes from the hierarchy
const collectTrackingData = (element: HTMLElement): Record<string, unknown> => {
  const trackingData: Record<string, unknown> = {}

  // First, find the highest ancestor with data-track
  let topTrackElement: HTMLElement | null = null
  let currentElement: HTMLElement | null = element

  // Traverse up to find the highest element with data-track
  while (currentElement) {
    if (currentElement.dataset['track'] !== undefined) {
      topTrackElement = currentElement
    }
    currentElement = currentElement.parentElement
  }

  // If no ancestor with data-track found, return empty
  if (!topTrackElement) {
    return trackingData
  }

  // Now collect all data-track-* attributes from the top element down to the clicked element
  const elementsToCheck: HTMLElement[] = []

  // Build a path from the clicked element up to the top track element
  currentElement = element
  while (currentElement && currentElement !== topTrackElement) {
    elementsToCheck.unshift(currentElement) // Add to beginning to maintain order
    currentElement = currentElement.parentElement
  }

  // Add the top track element itself
  if (currentElement === topTrackElement) {
    elementsToCheck.unshift(topTrackElement)
  }

  // Collect all data-track-* attributes from all elements in the path
  elementsToCheck.forEach((el) => {
    Object.keys(el.dataset).forEach((key) => {
      if (key.startsWith('track')) {
        const cleanKey = key.replace(/^track/, '').toLowerCase()
        // Child elements take precedence (later elements override earlier ones)
        trackingData[cleanKey] = el.dataset[key]
      }
    })
  })

  return trackingData
}

export const createClickTracker = () => {
  let initialized = false

  const handleClick = (event: Event) => {
    const target = event.target as HTMLElement

    const trackingData = collectTrackingData(target)

    if (trackingData[''] === undefined) return

    const eventType = trackingData['event'] || 'link_click'

    // Start with generic properties
    const properties: Record<string, unknown> = {
      element_id: target.id || null
    }

    // Handle link_click specifically
    if (eventType === 'link_click') {
      const link = target.closest('a')

      if (!link || !link.href) {
        console.warn('link_click event triggered but no valid link found')
        return
      }

      const linkType = (trackingData['linktype'] as string) || inferLinkType(link.href)

      // Add event-specific properties
      const generator = eventPropertyFactory.createGenerator(linkType)
      if (generator) {
        Object.assign(properties, generator(link))
      }
    } else {
      // For non-link events, bail for now
      console.warn(`Event type '${eventType}' is not yet implemented`)
      return
    }

    // Add custom data attributes from the hierarchy
    Object.keys(trackingData).forEach((key) => {
      if (key.startsWith('prop')) {
        const propName = key.replace('prop', '').toLowerCase()
        properties[propName] = trackingData[key]
      }
    })

    if (window.analytics) {
      window.analytics.track(eventType, properties)
    }
  }

  const initialize = () => {
    if (!initialized) {
      document.addEventListener('click', handleClick)
      initialized = true
    }
  }

  const isInitialized = () => initialized

  return { initialize, handleClick, isInitialized }
}

export const clickTracker = createClickTracker()
