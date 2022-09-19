import * as yaml from 'js-yaml';

export type Node = {
  name?: string;
  endpoint?: string;
  'driver-opts'?: Array<string>;
  'buildkitd-flags'?: string;
  platforms?: string;
};

export function Parse(data: string): Node[] {
  return yaml.load(data) as Node[];
}
