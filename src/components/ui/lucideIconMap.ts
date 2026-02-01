import type { LucideIcon } from 'lucide-react';
import React from 'react';

type LucideIconModule = { default: LucideIcon };

export const LUCIDE_ICON_IMPORTERS = {
  AlertCircle: () => import('lucide-react/dist/esm/icons/alert-circle.js'),
  Archive: () => import('lucide-react/dist/esm/icons/archive.js'),
  AtSign: () => import('lucide-react/dist/esm/icons/at-sign.js'),
  Bell: () => import('lucide-react/dist/esm/icons/bell.js'),
  Bike: () => import('lucide-react/dist/esm/icons/bike.js'),
  Bot: () => import('lucide-react/dist/esm/icons/bot.js'),
  Book: () => import('lucide-react/dist/esm/icons/book.js'),
  BookOpen: () => import('lucide-react/dist/esm/icons/book-open.js'),
  Bookmark: () => import('lucide-react/dist/esm/icons/bookmark.js'),
  Camera: () => import('lucide-react/dist/esm/icons/camera.js'),
  Calendar: () => import('lucide-react/dist/esm/icons/calendar.js'),
  Car: () => import('lucide-react/dist/esm/icons/car.js'),
  Check: () => import('lucide-react/dist/esm/icons/check.js'),
  ChevronDown: () => import('lucide-react/dist/esm/icons/chevron-down.js'),
  ChevronUp: () => import('lucide-react/dist/esm/icons/chevron-up.js'),
  Chrome: () => import('lucide-react/dist/esm/icons/chrome.js'),
  Circle: () => import('lucide-react/dist/esm/icons/circle.js'),
  Clock: () => import('lucide-react/dist/esm/icons/clock.js'),
  Cloud: () => import('lucide-react/dist/esm/icons/cloud.js'),
  CloudRain: () => import('lucide-react/dist/esm/icons/cloud-rain.js'),
  CloudSnow: () => import('lucide-react/dist/esm/icons/cloud-snow.js'),
  Code: () => import('lucide-react/dist/esm/icons/code.js'),
  Columns: () => import('lucide-react/dist/esm/icons/columns.js'),
  Copy: () => import('lucide-react/dist/esm/icons/copy.js'),
  CreditCard: () => import('lucide-react/dist/esm/icons/credit-card.js'),
  Database: () => import('lucide-react/dist/esm/icons/database.js'),
  Download: () => import('lucide-react/dist/esm/icons/download.js'),
  Edit: () => import('lucide-react/dist/esm/icons/edit.js'),
  ExternalLink: () => import('lucide-react/dist/esm/icons/external-link.js'),
  File: () => import('lucide-react/dist/esm/icons/file.js'),
  FileText: () => import('lucide-react/dist/esm/icons/file-text.js'),
  Filter: () => import('lucide-react/dist/esm/icons/filter.js'),
  Flag: () => import('lucide-react/dist/esm/icons/flag.js'),
  Folder: () => import('lucide-react/dist/esm/icons/folder.js'),
  Gamepad2: () => import('lucide-react/dist/esm/icons/gamepad-2.js'),
  Github: () => import('lucide-react/dist/esm/icons/github.js'),
  Gitlab: () => import('lucide-react/dist/esm/icons/gitlab.js'),
  Globe: () => import('lucide-react/dist/esm/icons/globe.js'),
  Grid: () => import('lucide-react/dist/esm/icons/grid.js'),
  Hash: () => import('lucide-react/dist/esm/icons/hash.js'),
  Headphones: () => import('lucide-react/dist/esm/icons/headphones.js'),
  Heart: () => import('lucide-react/dist/esm/icons/heart.js'),
  Hexagon: () => import('lucide-react/dist/esm/icons/hexagon.js'),
  Highlighter: () => import('lucide-react/dist/esm/icons/highlighter.js'),
  Home: () => import('lucide-react/dist/esm/icons/home.js'),
  Image: () => import('lucide-react/dist/esm/icons/image.js'),
  Info: () => import('lucide-react/dist/esm/icons/info.js'),
  Layers: () => import('lucide-react/dist/esm/icons/layers.js'),
  Layout: () => import('lucide-react/dist/esm/icons/layout.js'),
  Link: () => import('lucide-react/dist/esm/icons/link.js'),
  List: () => import('lucide-react/dist/esm/icons/list.js'),
  Lock: () => import('lucide-react/dist/esm/icons/lock.js'),
  Mail: () => import('lucide-react/dist/esm/icons/mail.js'),
  MapPin: () => import('lucide-react/dist/esm/icons/map-pin.js'),
  Menu: () => import('lucide-react/dist/esm/icons/menu.js'),
  MessageCircle: () => import('lucide-react/dist/esm/icons/message-circle.js'),
  MessageSquare: () => import('lucide-react/dist/esm/icons/message-square.js'),
  Mic: () => import('lucide-react/dist/esm/icons/mic.js'),
  Minus: () => import('lucide-react/dist/esm/icons/minus.js'),
  Moon: () => import('lucide-react/dist/esm/icons/moon.js'),
  MoreVertical: () => import('lucide-react/dist/esm/icons/more-vertical.js'),
  Music: () => import('lucide-react/dist/esm/icons/music.js'),
  Package: () => import('lucide-react/dist/esm/icons/package.js'),
  Palette: () => import('lucide-react/dist/esm/icons/palette.js'),
  Pause: () => import('lucide-react/dist/esm/icons/pause.js'),
  PenTool: () => import('lucide-react/dist/esm/icons/pen-tool.js'),
  Percent: () => import('lucide-react/dist/esm/icons/percent.js'),
  Phone: () => import('lucide-react/dist/esm/icons/phone.js'),
  Pin: () => import('lucide-react/dist/esm/icons/pin.js'),
  Plane: () => import('lucide-react/dist/esm/icons/plane.js'),
  Play: () => import('lucide-react/dist/esm/icons/play.js'),
  Plus: () => import('lucide-react/dist/esm/icons/plus.js'),
  Rocket: () => import('lucide-react/dist/esm/icons/rocket.js'),
  Search: () => import('lucide-react/dist/esm/icons/search.js'),
  Send: () => import('lucide-react/dist/esm/icons/send.js'),
  Server: () => import('lucide-react/dist/esm/icons/server.js'),
  Settings: () => import('lucide-react/dist/esm/icons/settings.js'),
  Share: () => import('lucide-react/dist/esm/icons/share.js'),
  Ship: () => import('lucide-react/dist/esm/icons/ship.js'),
  ShoppingCart: () => import('lucide-react/dist/esm/icons/shopping-cart.js'),
  Sidebar: () => import('lucide-react/dist/esm/icons/sidebar.js'),
  Square: () => import('lucide-react/dist/esm/icons/square.js'),
  Star: () => import('lucide-react/dist/esm/icons/star.js'),
  Store: () => import('lucide-react/dist/esm/icons/store.js'),
  Sun: () => import('lucide-react/dist/esm/icons/sun.js'),
  Tag: () => import('lucide-react/dist/esm/icons/tag.js'),
  Target: () => import('lucide-react/dist/esm/icons/target.js'),
  Terminal: () => import('lucide-react/dist/esm/icons/terminal.js'),
  Thermometer: () => import('lucide-react/dist/esm/icons/thermometer.js'),
  Train: () => import('lucide-react/dist/esm/icons/train.js'),
  Trash2: () => import('lucide-react/dist/esm/icons/trash-2.js'),
  Triangle: () => import('lucide-react/dist/esm/icons/triangle.js'),
  Truck: () => import('lucide-react/dist/esm/icons/truck.js'),
  Type: () => import('lucide-react/dist/esm/icons/type.js'),
  Upload: () => import('lucide-react/dist/esm/icons/upload.js'),
  User: () => import('lucide-react/dist/esm/icons/user.js'),
  Users: () => import('lucide-react/dist/esm/icons/users.js'),
  Video: () => import('lucide-react/dist/esm/icons/video.js'),
  Volume2: () => import('lucide-react/dist/esm/icons/volume-2.js'),
  Wifi: () => import('lucide-react/dist/esm/icons/wifi.js'),
  Wind: () => import('lucide-react/dist/esm/icons/wind.js'),
  X: () => import('lucide-react/dist/esm/icons/x.js'),
  Zap: () => import('lucide-react/dist/esm/icons/zap.js'),
} satisfies Record<string, () => Promise<LucideIconModule>>;

export type LucideIconName = keyof typeof LUCIDE_ICON_IMPORTERS;

export const LUCIDE_ICON_NAMES = Object.keys(LUCIDE_ICON_IMPORTERS) as LucideIconName[];

export function isLucideIconName(name: string): name is LucideIconName {
  return Object.hasOwn(LUCIDE_ICON_IMPORTERS, name);
}

const lazyIconCache = new Map<LucideIconName, React.LazyExoticComponent<LucideIcon>>();

export function getLucideIconLazy(name: LucideIconName): React.LazyExoticComponent<LucideIcon> {
  const cached = lazyIconCache.get(name);
  if (cached) return cached;

  const LazyIcon = React.lazy(LUCIDE_ICON_IMPORTERS[name] as () => Promise<LucideIconModule>);
  lazyIconCache.set(name, LazyIcon);
  return LazyIcon;
}
