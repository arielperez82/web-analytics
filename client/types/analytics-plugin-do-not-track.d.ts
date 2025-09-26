declare module 'analytics-plugin-do-not-track' {
  const doNotTrack: () => {
    name: string
    initialize: () => void
    page: () => void
    track: () => void
    identify: () => void
    loaded: () => boolean
  }

  export default doNotTrack
}
