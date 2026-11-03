import { IconName, isIconName } from '../../../shared/ui/icon.component';

/** The API names icons with plain strings; an unknown name falls back instead of breaking the page. */
export function widgetIcon(name: string, fallback: IconName = 'bar-chart'): IconName {
  return isIconName(name) ? name : fallback;
}
