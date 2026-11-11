import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createClickTracker } from './click-tracker'

describe('ClickTracker', () => {
  let clickTracker: ReturnType<typeof createClickTracker>
  let mockAnalytics: { track: ReturnType<typeof vi.fn> }

  const eventPropagationBlocker = (e: Event) => e.preventDefault()

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = ''

    // Mock analytics
    mockAnalytics = { track: vi.fn() }
    Object.defineProperty(window, 'analytics', {
      value: mockAnalytics,
      writable: true
    })

    // Prevent linkclicks from navigatingaway (and thus causing jsdom navigation to another Document error)
    document.addEventListener('click', eventPropagationBlocker, true)

    // Create fresh click tracker instance
    clickTracker = createClickTracker()
  })

  afterEach(() => {
    // Clean up event listeners
    document.removeEventListener('click', clickTracker.handleClick)
    document.removeEventListener('click', eventPropagationBlocker)
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('starts uninitialized', () => {
      expect(clickTracker.isInitialized()).toBeFalsy()
    })

    describe('when initialized', () => {
      it('adds the click handler to the document', () => {
        const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

        clickTracker.initialize()

        expect(addEventListenerSpy).toHaveBeenCalledWith('click', clickTracker.handleClick)
      })

      it('marks itself as initialized', () => {
        clickTracker.initialize()

        expect(clickTracker.isInitialized()).toBeTruthy()
      })

      it('no-ops when initialized multiple times', () => {
        const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

        clickTracker.initialize()
        clickTracker.initialize()
        clickTracker.initialize()

        expect(addEventListenerSpy).toHaveBeenCalledTimes(1)
      })
    });

  })

  describe('Click Event Handling', () => {
    beforeEach(() => {
      clickTracker.initialize()
    })

    it('no-ops for clicks without data-track attribute', () => {
      const link = document.createElement('a')
      link.href = '/test'
      link.textContent = 'Test Link'
      document.body.appendChild(link)

      expect(() => link.click()).not.toThrow()
      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('tracks clicks with data-track attribute', () => {
      const link = document.createElement('a')
      link.href = '/test'
      link.textContent = 'Test Link'
      link.setAttribute('data-track', '')
      document.body.appendChild(link)

      link.click()

      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        link_url: 'http://localhost:3000/test',
        link_text: 'Test Link'
      }))
    })

    it('tracks clicks on child elements with data-track on parent', () => {
      const link = document.createElement('a')
      link.href = '/test'
      link.setAttribute('data-track', '')

      const span = document.createElement('span')
      span.textContent = 'Click me'
      link.appendChild(span)
      document.body.appendChild(link)

      span.click()

      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        link_url: 'http://localhost:3000/test'
      }))
    })

    it('no-ops and logs a warning for clicks with an unsupported event type', () => {
      const link = document.createElement('a')
      link.href = '/test'
      link.setAttribute('data-track', '')
      link.setAttribute('data-track-event', 'custom_click')
      document.body.appendChild(link)

      const consoleSpy = vi.spyOn(console, 'warn')
      link.click()

      expect(mockAnalytics.track).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('Event type \'custom_click\' is not yet implemented')
    })

    it('tracks clicks with custom link type', () => {
      const link = document.createElement('a')
      link.href = '/test'
      link.setAttribute('data-track', '')
      link.setAttribute('data-track-link-type', 'download')
      document.body.appendChild(link)

      link.click()
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        link_url: 'http://localhost:3000/test',
        link_type: 'download'
      }))
    })

    it('tracks data-track-prop attributes as custom properties', () => {
      const link = document.createElement('a')
      link.href = '/test'
      link.setAttribute('data-track', '')
      link.setAttribute('data-track-prop-category', 'cta')
      link.setAttribute('data-track-prop-position', 'header')
      document.body.appendChild(link)

      link.click()
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        category: 'cta',
        position: 'header'
      }))
    })

    it('includes element ID in properties when present', () => {
      const link = document.createElement('a')
      link.id = 'test-link'
      link.href = '/test'
      link.setAttribute('data-track', '')
      document.body.appendChild(link)

      link.click()
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        element_id: 'test-link'
      }))
    })
  })

  describe('Link Type Inference', () => {
    beforeEach(() => {
      clickTracker.initialize()
    })

    it('infers email links as email type and adds email fields', () => {
      const link = document.createElement('a')
      link.href = 'mailto:test@example.com?subject=foo&body=baz'
      link.setAttribute('data-track', '')
      document.body.appendChild(link)

      link.click()
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        email_address: 'test@example.com',
        email_subject: 'foo',
        email_body: 'baz',
        link_type: 'email'
      }))
    })

    it('infers social platform links as social type', () => {
      const link = document.createElement('a')
      link.href = 'https://twitter.com/user'
      link.setAttribute('data-track', '')
      document.body.appendChild(link)

      link.click()
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        platform: 'twitter',
        link_type: 'social'
      }))
    })

    it('infers media platform links as media type', () => {
      const link = document.createElement('a')
      link.href = 'https://youtube.com/watch?v=123'
      link.setAttribute('data-track', '')
      document.body.appendChild(link)

      link.click()
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        platform: 'youtube',
        link_type: 'media'
      }))
    })

    it('infers regular web links as web type', () => {
      const link = document.createElement('a')
      link.href = 'https://example.com/page'
      link.setAttribute('data-track', '')
      document.body.appendChild(link)

      link.click()
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        link_url: 'https://example.com/page',
        link_type: 'web'
      }))
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      clickTracker.initialize()
    })

    it('no-ops and logs a warning when href is missing on link element', () => {
      const link = document.createElement('a')
      link.setAttribute('data-track', '')
      document.body.appendChild(link)


      const consoleSpy = vi.spyOn(console, 'warn')
      link.click()
      expect(mockAnalytics.track).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('link_click event triggered but no valid link found')
    })

    it('no-ops and logs a warning when tracked element is not a link', () => {
      const button = document.createElement('button')
      button.setAttribute('data-track', '')
      document.body.appendChild(button)

      const consoleSpy = vi.spyOn(console, 'warn')
      button.click()
      expect(mockAnalytics.track).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('link_click event triggered but no valid link found')
    })

    it('no-ops when analytics is not available', () => {
      ((window as unknown as { analytics: undefined }).analytics = undefined)

      const link = document.createElement('a')
      link.href = '/test'
      link.setAttribute('data-track', '')
      document.body.appendChild(link)

      expect(() => link.click()).not.toThrow()
    })
  })

  describe('Complex Scenarios', () => {
    beforeEach(() => {
      clickTracker.initialize()
    })

    it('should handle nested elements with data-track on parent', () => {
      const link = document.createElement('a')
      link.href = '/test'
      link.setAttribute('data-track', '')
      link.setAttribute('data-track-prop-category', 'navigation')

      const icon = document.createElement('span')
      icon.setAttribute('data-icon', 'home')
      icon.textContent = '🏠'

      const text = document.createElement('span')
      text.textContent = 'Home'

      link.appendChild(icon)
      link.appendChild(text)
      document.body.appendChild(link)

      icon.click()

      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        category: 'navigation',
        link_url: 'http://localhost:3000/test'
      }))
    })

    it('marks external links correctly', () => {
      const link = document.createElement('a')
      link.href = 'https://external.com/page'
      link.setAttribute('data-track', '')
      document.body.appendChild(link)

      link.click()

      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        link_url: 'https://external.com/page',
        link_host: 'external.com',
        is_external: true
      }))
    })

    it('aggregates tracking data up the hierarchy', () => {
      // Create a nested structure with tracking data at multiple levels
      const container = document.createElement('div')
      container.setAttribute('data-track', '')
      container.setAttribute('data-track-prop-section', 'navigation')
      container.setAttribute('data-track-prop-theme', 'dark')
      container.setAttribute('data-track-prop-variant', 'secondary')

      const link = document.createElement('a')
      link.href = '/test'
      link.setAttribute('data-track-prop-category', 'cta')
      link.setAttribute('data-track-prop-position', 'header')

      const span = document.createElement('span')
      span.textContent = 'Click me'
      span.setAttribute('data-track-prop-variant', 'primary')

      link.appendChild(span)
      container.appendChild(link)
      document.body.appendChild(container)

      span.click()

      // Should include properties from all levels, with child elements taking precedence
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        section: 'navigation',  // from container
        theme: 'dark',         // from container
        category: 'cta',       // from link
        position: 'header',    // from link
        variant: 'primary',     // from span (child takes precedence over container)
        link_text: 'Click me'
      }))
    })

    it('handles custom event types from hierarchy', () => {
      const container = document.createElement('div')
      container.setAttribute('data-track', '')
      container.setAttribute('data-track-event', 'container_click')

      const link = document.createElement('a')
      link.href = '/test'
      link.setAttribute('data-track-event', 'link_click') // This should override

      const span = document.createElement('span')
      span.textContent = 'Click me'

      link.appendChild(span)
      container.appendChild(link)
      document.body.appendChild(container)

      span.click()

      // Child element's event type should take precedence
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.any(Object))
    })

    it('handles custom link types from hierarchy', () => {
      const container = document.createElement('div')
      container.setAttribute('data-track', '')
      container.setAttribute('data-track-link-type', 'external')

      const link = document.createElement('a')
      link.href = '/test'
      link.setAttribute('data-track-link-type', 'download') // This should override

      const span = document.createElement('span')
      span.textContent = 'Click me'

      link.appendChild(span)
      container.appendChild(link)
      document.body.appendChild(container)

      span.click()

      // Should use the link's link type (child takes precedence)
      expect(mockAnalytics.track).toHaveBeenCalledWith('link_click', expect.objectContaining({
        link_type: 'download'
      }))
    })
  })
})
