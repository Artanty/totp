import { buildDefaultLogo, type LogoPalette } from '../../assets/logo';

export function getLogoUrl(palette?: LogoPalette): string {
  return buildDefaultLogo(palette);
}
