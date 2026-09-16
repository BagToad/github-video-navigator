import arrowUpRight from '@tabler/icons/outline/arrow-up-right.svg?raw';
import bolt from '@tabler/icons/outline/bolt.svg?raw';
import book from '@tabler/icons/outline/book.svg?raw';
import brandGithub from '@tabler/icons/outline/brand-github.svg?raw';
import check from '@tabler/icons/outline/check.svg?raw';
import clock from '@tabler/icons/outline/clock.svg?raw';
import copy from '@tabler/icons/outline/copy.svg?raw';
import desktop from '@tabler/icons/outline/device-desktop.svg?raw';
import externalLink from '@tabler/icons/outline/external-link.svg?raw';
import link from '@tabler/icons/outline/link.svg?raw';
import list from '@tabler/icons/outline/list.svg?raw';
import lock from '@tabler/icons/outline/lock.svg?raw';
import moon from '@tabler/icons/outline/moon.svg?raw';
import play from '@tabler/icons/outline/player-play.svg?raw';
import shield from '@tabler/icons/outline/shield-check.svg?raw';
import sun from '@tabler/icons/outline/sun.svg?raw';
import upload from '@tabler/icons/outline/upload.svg?raw';
import x from '@tabler/icons/outline/x.svg?raw';

const icons: Record<string, string> = {
  'arrow-up-right': arrowUpRight,
  bolt,
  book,
  'brand-github': brandGithub,
  check,
  clock,
  copy,
  'device-desktop': desktop,
  'external-link': externalLink,
  link,
  list,
  lock,
  moon,
  'player-play': play,
  'shield-check': shield,
  sun,
  upload,
  x,
};

export function paintIcon(element: HTMLElement, name: string): void {
  const svg = icons[name];
  if (!svg) throw new Error(`Unknown icon: ${name}`);
  element.classList.add('icon-slot');
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = svg;
}

export function paintIcons(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-icon]')) {
    paintIcon(element, element.dataset.icon ?? '');
  }
}
