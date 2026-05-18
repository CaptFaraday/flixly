export function videoMimeForCodec(codec: string): string {
  return `video/mp4; codecs="${codec}"`;
}

export function audioMimeForCodec(codec: string): string {
  return `audio/mp4; codecs="${codec}"`;
}
