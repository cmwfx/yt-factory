declare module 'stream-json' {
  import { Transform } from 'stream';
  export function parser(): Transform;
}

declare module 'stream-json/filters/Pick' {
  import { Transform } from 'stream';
  export function pick(options: { filter: string }): Transform;
}

declare module 'stream-json/streamers/StreamArray' {
  import { Transform } from 'stream';
  export function streamArray(): Transform & AsyncIterable<{ key: number; value: any }>;
}
