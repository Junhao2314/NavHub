import { ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import Icon from './Icon';
import { LUCIDE_ICON_NAMES, type LucideIconName, resolveLucideIconName } from './lucideIconMap';

interface IconSelectorProps {
  onSelectIcon: (iconName: string) => void;
}

const ICON_PAGE_SIZE = 36;
const CATEGORY_SCROLL_STEP = 240;
const CATEGORY_SCROLL_HOLD_DELAY = 300;
const CATEGORY_SCROLL_HOLD_INTERVAL = 80;
const CATEGORY_SCROLL_HOLD_STEP = 72;
const CATEGORY_INERTIA_MIN_VELOCITY = 0.02;
const CATEGORY_INERTIA_DECAY = 0.92;

type IconCategoryId =
  | 'all'
  | 'common'
  | 'accessibility'
  | 'accountsAccess'
  | 'animals'
  | 'arrows'
  | 'brands'
  | 'buildings'
  | 'charts'
  | 'communication'
  | 'connectivity'
  | 'cursors'
  | 'design'
  | 'codingDevelopment'
  | 'devices'
  | 'emoji'
  | 'fileIcons'
  | 'finance'
  | 'foodBeverage'
  | 'gaming'
  | 'home'
  | 'layout'
  | 'mail'
  | 'mathematics'
  | 'medical'
  | 'multimedia'
  | 'nature'
  | 'navigationMapsPois'
  | 'notification'
  | 'people'
  | 'photography'
  | 'science'
  | 'seasons'
  | 'security'
  | 'shapes'
  | 'shopping'
  | 'social'
  | 'sports'
  | 'sustainability'
  | 'textFormatting'
  | 'timeCalendar'
  | 'tools'
  | 'transportation'
  | 'travel'
  | 'weather';

const ICON_CATEGORIES: ReadonlyArray<{ id: IconCategoryId; labelKey: string }> = [
  { id: 'all', labelKey: 'iconSelector.categories.all' },
  { id: 'common', labelKey: 'iconSelector.categories.common' },
  { id: 'accessibility', labelKey: 'iconSelector.categories.accessibility' },
  { id: 'accountsAccess', labelKey: 'iconSelector.categories.accountsAccess' },
  { id: 'animals', labelKey: 'iconSelector.categories.animals' },
  { id: 'arrows', labelKey: 'iconSelector.categories.arrows' },
  { id: 'brands', labelKey: 'iconSelector.categories.brands' },
  { id: 'buildings', labelKey: 'iconSelector.categories.buildings' },
  { id: 'charts', labelKey: 'iconSelector.categories.charts' },
  { id: 'communication', labelKey: 'iconSelector.categories.communication' },
  { id: 'connectivity', labelKey: 'iconSelector.categories.connectivity' },
  { id: 'cursors', labelKey: 'iconSelector.categories.cursors' },
  { id: 'design', labelKey: 'iconSelector.categories.design' },
  { id: 'codingDevelopment', labelKey: 'iconSelector.categories.codingDevelopment' },
  { id: 'devices', labelKey: 'iconSelector.categories.devices' },
  { id: 'emoji', labelKey: 'iconSelector.categories.emoji' },
  { id: 'fileIcons', labelKey: 'iconSelector.categories.fileIcons' },
  { id: 'finance', labelKey: 'iconSelector.categories.finance' },
  { id: 'foodBeverage', labelKey: 'iconSelector.categories.foodBeverage' },
  { id: 'gaming', labelKey: 'iconSelector.categories.gaming' },
  { id: 'home', labelKey: 'iconSelector.categories.home' },
  { id: 'layout', labelKey: 'iconSelector.categories.layout' },
  { id: 'mail', labelKey: 'iconSelector.categories.mail' },
  { id: 'mathematics', labelKey: 'iconSelector.categories.mathematics' },
  { id: 'medical', labelKey: 'iconSelector.categories.medical' },
  { id: 'multimedia', labelKey: 'iconSelector.categories.multimedia' },
  { id: 'nature', labelKey: 'iconSelector.categories.nature' },
  { id: 'navigationMapsPois', labelKey: 'iconSelector.categories.navigationMapsPois' },
  { id: 'notification', labelKey: 'iconSelector.categories.notification' },
  { id: 'people', labelKey: 'iconSelector.categories.people' },
  { id: 'photography', labelKey: 'iconSelector.categories.photography' },
  { id: 'science', labelKey: 'iconSelector.categories.science' },
  { id: 'seasons', labelKey: 'iconSelector.categories.seasons' },
  { id: 'security', labelKey: 'iconSelector.categories.security' },
  { id: 'shapes', labelKey: 'iconSelector.categories.shapes' },
  { id: 'shopping', labelKey: 'iconSelector.categories.shopping' },
  { id: 'social', labelKey: 'iconSelector.categories.social' },
  { id: 'sports', labelKey: 'iconSelector.categories.sports' },
  { id: 'sustainability', labelKey: 'iconSelector.categories.sustainability' },
  { id: 'textFormatting', labelKey: 'iconSelector.categories.textFormatting' },
  { id: 'timeCalendar', labelKey: 'iconSelector.categories.timeCalendar' },
  { id: 'tools', labelKey: 'iconSelector.categories.tools' },
  { id: 'transportation', labelKey: 'iconSelector.categories.transportation' },
  { id: 'travel', labelKey: 'iconSelector.categories.travel' },
  { id: 'weather', labelKey: 'iconSelector.categories.weather' },
] as const;

const makeKeywordMatcher =
  (keywords: readonly string[]) =>
  (name: LucideIconName): boolean =>
    keywords.some((keyword) => name.includes(keyword));

const CATEGORY_MATCHERS: Record<
  Exclude<IconCategoryId, 'all' | 'common'>,
  (name: LucideIconName) => boolean
> = {
  accessibility: makeKeywordMatcher(['Accessibility', 'Ear', 'Eye', 'Hand', 'Captions']),
  accountsAccess: makeKeywordMatcher([
    'User',
    'Users',
    'Contact',
    'LogIn',
    'LogOut',
    'Key',
    'Lock',
    'Unlock',
    'Fingerprint',
    'Shield',
    'ScanFace',
    'ScanEye',
    'Passkey',
  ]),
  animals: makeKeywordMatcher([
    'Cat',
    'Dog',
    'Fish',
    'Bird',
    'Rabbit',
    'Paw',
    'Bug',
    'Turtle',
    'Worm',
    'Rat',
    'Shrimp',
    'Snail',
  ]),
  arrows: makeKeywordMatcher([
    'Arrow',
    'Chevron',
    'Chevrons',
    'Corner',
    'Move',
    'Expand',
    'Shrink',
    'Rotate',
    'Undo',
    'Redo',
    'Refresh',
    'Repeat',
    'Rewind',
    'Forward',
    'Back',
    'Flip',
    'Swap',
    'Fold',
    'Unfold',
    'Step',
  ]),
  brands: makeKeywordMatcher([
    'Github',
    'Gitlab',
    'Twitter',
    'Facebook',
    'Instagram',
    'Linkedin',
    'Youtube',
    'Twitch',
    'Dribbble',
    'Figma',
    'Slack',
    'Chrome',
    'Firefox',
    'Apple',
    'Android',
    'Google',
  ]),
  buildings: makeKeywordMatcher([
    'Building',
    'Home',
    'House',
    'School',
    'Hospital',
    'Warehouse',
    'Church',
    'Store',
    'Hotel',
    'Landmark',
    'Castle',
    'Factory',
  ]),
  charts: makeKeywordMatcher([
    'Chart',
    'Trending',
    'Activity',
    'PieChart',
    'BarChart',
    'AreaChart',
    'Candlestick',
    'Gauge',
  ]),
  communication: makeKeywordMatcher([
    'Message',
    'Phone',
    'Send',
    'Megaphone',
    'Contact',
    'Voicemail',
    'Reply',
    'Forward',
    'Podcast',
    'Radio',
  ]),
  connectivity: makeKeywordMatcher([
    'Wifi',
    'Bluetooth',
    'Cable',
    'Plug',
    'Router',
    'Satellite',
    'Network',
    'Signal',
    'Cloud',
    'Link',
    'Unlink',
    'Webhook',
    'Usb',
    'Antenna',
  ]),
  cursors: makeKeywordMatcher(['Cursor', 'Pointer', 'Crosshair', 'Grab', 'Move']),
  design: makeKeywordMatcher([
    'Palette',
    'Pen',
    'Pencil',
    'Paint',
    'Brush',
    'Ruler',
    'Scissors',
    'Crop',
    'Layers',
    'Frame',
    'Spline',
    'Shapes',
    'SwatchBook',
  ]),
  codingDevelopment: makeKeywordMatcher([
    'Code',
    'Terminal',
    'Database',
    'Server',
    'Bug',
    'Braces',
    'Brackets',
    'Workflow',
    'Cpu',
    'Bot',
    'Binary',
    'Git',
    'FileCode',
    'Command',
    'Variable',
    'Function',
    'Regex',
    'Container',
    'Package',
    'Blocks',
  ]),
  devices: makeKeywordMatcher([
    'Laptop',
    'Pc',
    'Monitor',
    'Tablet',
    'Smartphone',
    'Phone',
    'Watch',
    'Tv',
    'Keyboard',
    'Mouse',
    'Printer',
    'Webcam',
    'HardDrive',
    'Router',
    'Projector',
    'Gamepad',
  ]),
  emoji: makeKeywordMatcher([
    'Smile',
    'Frown',
    'Laugh',
    'Meh',
    'Angry',
    'Thumbs',
    'Heart',
    'PartyPopper',
  ]),
  fileIcons: makeKeywordMatcher([
    'File',
    'Folder',
    'Archive',
    'Clipboard',
    'Book',
    'Bookmark',
    'Notebook',
    'Paperclip',
    'Receipt',
    'Library',
    'Scroll',
  ]),
  finance: makeKeywordMatcher([
    'Banknote',
    'Coins',
    'Wallet',
    'CreditCard',
    'BadgeDollarSign',
    'Receipt',
    'Landmark',
    'HandCoins',
    'PiggyBank',
    'ChartCandlestick',
    'Dollar',
    'Euro',
    'Pound',
    'Yen',
    'Bitcoin',
    'IndianRupee',
    'Percent',
  ]),
  foodBeverage: makeKeywordMatcher([
    'Utensils',
    'Cup',
    'Coffee',
    'Pizza',
    'Sandwich',
    'Soup',
    'IceCream',
    'ChefHat',
    'Beer',
    'Wine',
    'GlassWater',
    'Popcorn',
    'Candy',
    'Apple',
    'Carrot',
  ]),
  gaming: makeKeywordMatcher([
    'Gamepad',
    'Joystick',
    'Dice',
    'Trophy',
    'Target',
    'Swords',
    'Crosshair',
    'Medal',
    'Crown',
  ]),
  home: makeKeywordMatcher([
    'Home',
    'House',
    'Sofa',
    'Bed',
    'Lamp',
    'Bath',
    'Door',
    'ShowerHead',
    'CookingPot',
    'Refrigerator',
    'WashingMachine',
  ]),
  layout: makeKeywordMatcher([
    'Layout',
    'Panel',
    'Columns',
    'Rows',
    'Grid',
    'List',
    'Sidebar',
    'Table',
    'Between',
    'Split',
    'Dock',
    'Wrap',
    'Align',
  ]),
  mail: makeKeywordMatcher([
    'Mail',
    'Inbox',
    'Outbox',
    'Send',
    'Reply',
    'Forward',
    'AtSign',
    'Stamp',
  ]),
  mathematics: makeKeywordMatcher([
    'Plus',
    'Minus',
    'X',
    'Divide',
    'Equal',
    'Percent',
    'Pi',
    'Sigma',
    'Calculator',
    'Radical',
    'Infinity',
  ]),
  medical: makeKeywordMatcher([
    'HeartPulse',
    'Stethoscope',
    'Syringe',
    'Pill',
    'Hospital',
    'Bandage',
    'Bone',
    'Thermometer',
    'Cross',
  ]),
  multimedia: makeKeywordMatcher([
    'Play',
    'Pause',
    'Stop',
    'Skip',
    'Music',
    'Volume',
    'Mic',
    'Headphones',
    'Video',
    'Camera',
    'Image',
    'Film',
    'Clapperboard',
    'Radio',
    'Disc',
    'Podcast',
    'Album',
    'Audio',
    'Equalizer',
    'Gallery',
    'Tv',
  ]),
  nature: makeKeywordMatcher([
    'Leaf',
    'Tree',
    'Flower',
    'Sprout',
    'Mountain',
    'Droplet',
    'Flame',
    'Bug',
    'Fish',
    'Bird',
    'Paw',
    'Waves',
    'Sun',
    'Moon',
    'Cloud',
    'Rain',
    'Snow',
    'Wind',
  ]),
  navigationMapsPois: makeKeywordMatcher([
    'Map',
    'Compass',
    'Globe',
    'Locate',
    'Navigation',
    'Route',
    'MapPin',
    'Pin',
    'Waypoint',
    'Signpost',
    'Milestone',
    'Radar',
  ]),
  notification: makeKeywordMatcher([
    'Bell',
    'Alarm',
    'BadgeAlert',
    'Info',
    'Alert',
    'Warning',
    'Siren',
  ]),
  people: makeKeywordMatcher(['User', 'Users', 'Contact']),
  photography: makeKeywordMatcher([
    'Camera',
    'Image',
    'Gallery',
    'Scan',
    'Focus',
    'Aperture',
    'Film',
    'Clapperboard',
    'Crop',
  ]),
  science: makeKeywordMatcher([
    'Atom',
    'Flask',
    'TestTube',
    'Microscope',
    'Telescope',
    'Dna',
    'Orbit',
    'Magnet',
    'Radiation',
    'Beaker',
    'Brain',
  ]),
  seasons: makeKeywordMatcher([
    'Sun',
    'Snowflake',
    'Leaf',
    'Flower',
    'CloudRain',
    'CloudSnow',
    'Umbrella',
  ]),
  security: makeKeywordMatcher([
    'Lock',
    'Unlock',
    'Key',
    'Shield',
    'Fingerprint',
    'ScanFace',
    'ScanEye',
    'AlarmSmoke',
    'Siren',
    'ShieldAlert',
    'ShieldCheck',
  ]),
  shapes: makeKeywordMatcher([
    'Circle',
    'Square',
    'Triangle',
    'Hexagon',
    'Octagon',
    'Pentagon',
    'Diamond',
    'Star',
    'Heart',
    'Shapes',
    'Spline',
  ]),
  shopping: makeKeywordMatcher([
    'Shopping',
    'Cart',
    'Store',
    'Bag',
    'Package',
    'Gift',
    'Tag',
    'Barcode',
    'Receipt',
    'Ticket',
    'Truck',
  ]),
  social: makeKeywordMatcher([
    'Message',
    'Users',
    'Share',
    'ThumbsUp',
    'ThumbsDown',
    'Heart',
    'Smile',
    'AtSign',
    'Send',
  ]),
  sports: makeKeywordMatcher([
    'Dumbbell',
    'Bike',
    'Trophy',
    'Medal',
    'Volleyball',
    'Goal',
    'Target',
  ]),
  sustainability: makeKeywordMatcher([
    'Leaf',
    'Recycle',
    'Solar',
    'Wind',
    'Battery',
    'Plug',
    'Droplet',
    'Sprout',
    'Globe',
    'Tree',
  ]),
  textFormatting: makeKeywordMatcher([
    'Text',
    'Type',
    'Align',
    'Bold',
    'Italic',
    'Underline',
    'Strikethrough',
    'List',
    'Quote',
    'Pilcrow',
    'Case',
    'Superscript',
    'Subscript',
    'WrapText',
    'WholeWord',
    'RemoveFormatting',
    'Indent',
    'Outdent',
  ]),
  timeCalendar: makeKeywordMatcher([
    'Clock',
    'Alarm',
    'Calendar',
    'Timer',
    'Watch',
    'Hourglass',
    'History',
    'CalendarDays',
    'CalendarCheck',
    'CalendarClock',
  ]),
  tools: makeKeywordMatcher([
    'Wrench',
    'Hammer',
    'Tool',
    'Screwdriver',
    'Scissors',
    'Ruler',
    'Settings',
    'Gauge',
    'Shovel',
    'Axe',
    'Drill',
  ]),
  transportation: makeKeywordMatcher([
    'Car',
    'Bus',
    'Bike',
    'Train',
    'Tram',
    'Subway',
    'Ship',
    'Plane',
    'Truck',
    'Forklift',
    'Ambulance',
    'Sailboat',
    'TrafficCone',
    'Fuel',
    'ParkingCircle',
  ]),
  travel: makeKeywordMatcher([
    'Luggage',
    'Plane',
    'Tent',
    'Mountain',
    'Hotel',
    'Ticket',
    'Compass',
    'Map',
    'Route',
    'Navigation',
    'Train',
    'Car',
    'Bus',
    'Ship',
  ]),
  weather: makeKeywordMatcher([
    'Sun',
    'Sunrise',
    'Sunset',
    'Moon',
    'Cloud',
    'Rain',
    'Snow',
    'Wind',
    'Thermometer',
    'Umbrella',
    'Haze',
    'Rainbow',
    'Tornado',
    'CloudLightning',
  ]),
};

const COMMON_LUCIDE_ICON_NAMES = [
  'Star',
  'Heart',
  'Bookmark',
  'Flag',
  'Tag',
  'Hash',
  'Home',
  'User',
  'Users',
  'Settings',
  'Bell',
  'Mail',
  'Calendar',
  'Clock',
  'MapPin',
  'Phone',
  'Camera',
  'Image',
  'Folder',
  'File',
  'Archive',
  'Trash2',
  'Download',
  'Upload',
  'Search',
  'Filter',
  'Menu',
  'MoreVertical',
  'ChevronDown',
  'ChevronUp',
  'Plus',
  'Minus',
  'X',
  'Check',
  'AlertCircle',
  'Info',
  'Edit',
  'Copy',
  'Share',
  'Link',
  'ExternalLink',
  'Lock',
  'Code',
  'Terminal',
  'Database',
  'Server',
  'Cloud',
  'Wifi',
  'ShoppingCart',
  'CreditCard',
  'Package',
  'Truck',
  'Store',
  'Music',
  'Play',
  'Pause',
  'Volume2',
  'Headphones',
  'Mic',
  'Book',
  'BookOpen',
  'FileText',
  'PenTool',
  'Type',
  'Layout',
  'Grid',
  'List',
  'Columns',
  'Sidebar',
  'Layers',
  'Circle',
  'Square',
  'Triangle',
  'Hexagon',
  'Zap',
  'Target',
  'Rocket',
  'Plane',
  'Car',
  'Bike',
  'Ship',
  'Train',
  'Moon',
  'Sun',
  'CloudRain',
  'CloudSnow',
  'Wind',
  'Thermometer',
  'Github',
  'Gitlab',
  'Chrome',
  'MessageSquare',
  'MessageCircle',
  'Send',
  'AtSign',
  'Percent',
  'Bot',
  'Pin',
  'Palette',
  'Gamepad2',
] as const;

const LUCIDE_ICON_NAME_SET = new Set<LucideIconName>(LUCIDE_ICON_NAMES);
const COMMON_LUCIDE_ICON_LIST = COMMON_LUCIDE_ICON_NAMES.filter((name) =>
  LUCIDE_ICON_NAME_SET.has(name as LucideIconName),
) as LucideIconName[];
const COMMON_LUCIDE_ICON_SET = new Set<LucideIconName>(COMMON_LUCIDE_ICON_LIST);

const DEFAULT_LUCIDE_ICON_NAMES: LucideIconName[] = [
  ...COMMON_LUCIDE_ICON_LIST,
  ...LUCIDE_ICON_NAMES.filter((name) => !COMMON_LUCIDE_ICON_SET.has(name)),
];

const isTextIcon = (rawName: string): boolean => {
  const trimmed = rawName.trim();
  if (!trimmed) return false;
  return !/^[a-z0-9-]+$/i.test(trimmed);
};

const IconSelector: React.FC<IconSelectorProps> = ({ onSelectIcon }) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<IconCategoryId>('all');
  const [selectedIcon, setSelectedIcon] = useState('Folder');
  const [isValidIcon, setIsValidIcon] = useState(true);
  const [page, setPage] = useState(0);
  const iconsContainerRef = useRef<HTMLDivElement | null>(null);
  const categoryChipsRef = useRef<HTMLDivElement | null>(null);
  const categoryDragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    hasMoved: boolean;
    lastX: number;
    lastTimestamp: number;
    velocityPxPerMs: number;
  } | null>(null);
  const categoryInertiaFrameRef = useRef<number | null>(null);
  const categoryInertiaVelocityRef = useRef(0);
  const categoryScrollHoldTimeoutRef = useRef<number | null>(null);
  const categoryScrollHoldIntervalRef = useRef<number | null>(null);
  const [canScrollCategoriesLeft, setCanScrollCategoriesLeft] = useState(false);
  const [canScrollCategoriesRight, setCanScrollCategoriesRight] = useState(false);
  const [isCategoryDragging, setIsCategoryDragging] = useState(false);

  const categorizedIcons = useMemo(() => {
    const byCategory = Object.fromEntries(
      ICON_CATEGORIES.map((item) => [item.id, [] as LucideIconName[]]),
    ) as Record<IconCategoryId, LucideIconName[]>;

    byCategory.all = DEFAULT_LUCIDE_ICON_NAMES;
    byCategory.common = COMMON_LUCIDE_ICON_LIST;

    for (const iconName of DEFAULT_LUCIDE_ICON_NAMES) {
      for (const [categoryId, matcher] of Object.entries(CATEGORY_MATCHERS) as Array<
        [Exclude<IconCategoryId, 'all' | 'common'>, (name: LucideIconName) => boolean]
      >) {
        if (!matcher(iconName)) continue;
        byCategory[categoryId].push(iconName);
      }
    }

    return byCategory;
  }, []);

  const availableCategories = useMemo(
    () =>
      ICON_CATEGORIES.filter(
        (item) => item.id === 'all' || item.id === 'common' || categorizedIcons[item.id].length > 0,
      ),
    [categorizedIcons],
  );

  useEffect(() => {
    if (availableCategories.some((item) => item.id === category)) return;
    setCategory('all');
  }, [availableCategories, category]);

  const updateCategoryScrollButtons = useCallback(() => {
    const container = categoryChipsRef.current;
    if (!container) {
      setCanScrollCategoriesLeft(false);
      setCanScrollCategoriesRight(false);
      return;
    }

    const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
    setCanScrollCategoriesLeft(container.scrollLeft > 0);
    setCanScrollCategoriesRight(container.scrollLeft < maxScrollLeft - 1);
  }, []);

  useEffect(() => {
    updateCategoryScrollButtons();
  }, [updateCategoryScrollButtons]);

  useEffect(() => {
    const handleResize = () => {
      updateCategoryScrollButtons();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateCategoryScrollButtons]);

  const stopCategoryScrollInertia = useCallback(() => {
    if (categoryInertiaFrameRef.current !== null) {
      window.cancelAnimationFrame(categoryInertiaFrameRef.current);
      categoryInertiaFrameRef.current = null;
    }

    categoryInertiaVelocityRef.current = 0;
  }, []);

  const startCategoryScrollInertia = useCallback(
    (initialVelocityPxPerMs: number) => {
      const container = categoryChipsRef.current;
      if (!container) return;

      if (Math.abs(initialVelocityPxPerMs) < CATEGORY_INERTIA_MIN_VELOCITY) return;

      stopCategoryScrollInertia();
      categoryInertiaVelocityRef.current = initialVelocityPxPerMs;

      let lastTimestamp = performance.now();

      const tick = () => {
        const currentContainer = categoryChipsRef.current;
        if (!currentContainer) {
          stopCategoryScrollInertia();
          return;
        }

        const velocity = categoryInertiaVelocityRef.current;
        if (Math.abs(velocity) < CATEGORY_INERTIA_MIN_VELOCITY) {
          stopCategoryScrollInertia();
          return;
        }

        const currentTimestamp = performance.now();
        const deltaTime = currentTimestamp - lastTimestamp;
        lastTimestamp = currentTimestamp;

        const maxScrollLeft = Math.max(
          currentContainer.scrollWidth - currentContainer.clientWidth,
          0,
        );
        if (maxScrollLeft <= 0) {
          stopCategoryScrollInertia();
          return;
        }

        const nextScrollLeft = currentContainer.scrollLeft + velocity * deltaTime;
        const clampedScrollLeft = Math.min(Math.max(nextScrollLeft, 0), maxScrollLeft);
        currentContainer.scrollLeft = clampedScrollLeft;
        updateCategoryScrollButtons();

        if (clampedScrollLeft <= 0 || clampedScrollLeft >= maxScrollLeft) {
          stopCategoryScrollInertia();
          return;
        }

        const decay = Math.pow(CATEGORY_INERTIA_DECAY, deltaTime / 16.67);
        categoryInertiaVelocityRef.current = velocity * decay;
        categoryInertiaFrameRef.current = window.requestAnimationFrame(tick);
      };

      categoryInertiaFrameRef.current = window.requestAnimationFrame(tick);
    },
    [stopCategoryScrollInertia, updateCategoryScrollButtons],
  );

  const scrollCategoryChips = useCallback(
    (direction: 'left' | 'right', options?: { behavior?: ScrollBehavior; step?: number }) => {
      stopCategoryScrollInertia();

      const container = categoryChipsRef.current;
      if (!container) return;

      const behavior = options?.behavior ?? 'smooth';
      const step = options?.step ?? CATEGORY_SCROLL_STEP;
      const offset = direction === 'left' ? -step : step;
      container.scrollBy({ left: offset, behavior });

      if (behavior === 'smooth') {
        window.setTimeout(updateCategoryScrollButtons, 180);
      } else {
        updateCategoryScrollButtons();
      }
    },
    [stopCategoryScrollInertia, updateCategoryScrollButtons],
  );

  const stopCategoryScrollHold = useCallback(() => {
    if (categoryScrollHoldTimeoutRef.current !== null) {
      window.clearTimeout(categoryScrollHoldTimeoutRef.current);
      categoryScrollHoldTimeoutRef.current = null;
    }

    if (categoryScrollHoldIntervalRef.current !== null) {
      window.clearInterval(categoryScrollHoldIntervalRef.current);
      categoryScrollHoldIntervalRef.current = null;
    }
  }, []);

  const startCategoryScrollHold = useCallback(
    (direction: 'left' | 'right') => {
      stopCategoryScrollHold();
      stopCategoryScrollInertia();
      categoryScrollHoldTimeoutRef.current = window.setTimeout(() => {
        categoryScrollHoldIntervalRef.current = window.setInterval(() => {
          scrollCategoryChips(direction, {
            behavior: 'auto',
            step: CATEGORY_SCROLL_HOLD_STEP,
          });
        }, CATEGORY_SCROLL_HOLD_INTERVAL);
      }, CATEGORY_SCROLL_HOLD_DELAY);
    },
    [scrollCategoryChips, stopCategoryScrollHold, stopCategoryScrollInertia],
  );

  useEffect(
    () => () => {
      stopCategoryScrollHold();
      stopCategoryScrollInertia();

      const drag = categoryDragRef.current;
      const container = categoryChipsRef.current;
      if (drag && container?.hasPointerCapture(drag.pointerId)) {
        container.releasePointerCapture(drag.pointerId);
      }
      categoryDragRef.current = null;
    },
    [stopCategoryScrollHold, stopCategoryScrollInertia],
  );

  const stopCategoryTrackDrag = useCallback(
    (event?: React.PointerEvent<HTMLDivElement>) => {
      const drag = categoryDragRef.current;
      if (!drag) return;

      if (event && drag.pointerId !== event.pointerId) return;

      const shouldStartInertia =
        event?.type === 'pointerup' &&
        drag.hasMoved &&
        Math.abs(drag.velocityPxPerMs) >= CATEGORY_INERTIA_MIN_VELOCITY;
      const inertiaVelocity = drag.velocityPxPerMs;

      const container = categoryChipsRef.current;
      if (container?.hasPointerCapture(drag.pointerId)) {
        container.releasePointerCapture(drag.pointerId);
      }

      categoryDragRef.current = null;
      setIsCategoryDragging(false);

      if (shouldStartInertia) {
        startCategoryScrollInertia(inertiaVelocity);
      }
    },
    [startCategoryScrollInertia],
  );

  const handleCategoryTrackPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      if (event.target instanceof Element && event.target.closest('button')) return;

      const container = categoryChipsRef.current;
      if (!container) return;

      if (container.scrollWidth <= container.clientWidth) return;

      stopCategoryScrollHold();
      stopCategoryScrollInertia();

      categoryDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollLeft: container.scrollLeft,
        hasMoved: false,
        lastX: event.clientX,
        lastTimestamp: performance.now(),
        velocityPxPerMs: 0,
      };

      container.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [stopCategoryScrollHold, stopCategoryScrollInertia],
  );

  const handleCategoryTrackPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = categoryDragRef.current;
      const container = categoryChipsRef.current;
      if (!drag || !container || drag.pointerId !== event.pointerId) return;

      const totalDeltaX = event.clientX - drag.startX;
      if (!drag.hasMoved) {
        if (Math.abs(totalDeltaX) < 3) return;
        drag.hasMoved = true;
        setIsCategoryDragging(true);
      }

      const now = performance.now();
      const moveDeltaX = event.clientX - drag.lastX;
      const deltaTime = Math.max(now - drag.lastTimestamp, 1);
      const instantVelocity = -moveDeltaX / deltaTime;
      drag.velocityPxPerMs = drag.velocityPxPerMs * 0.75 + instantVelocity * 0.25;
      drag.lastX = event.clientX;
      drag.lastTimestamp = now;

      container.scrollLeft = drag.startScrollLeft - totalDeltaX;
      updateCategoryScrollButtons();
      event.preventDefault();
    },
    [updateCategoryScrollButtons],
  );

  const handleCategoryChange = (nextCategory: IconCategoryId) => {
    stopCategoryScrollInertia();
    setCategory(nextCategory);
    setPage(0);
    const container = iconsContainerRef.current;
    if (container) container.scrollTop = 0;
  };

  const baseIcons = useMemo(
    () => categorizedIcons[category] ?? DEFAULT_LUCIDE_ICON_NAMES,
    [category, categorizedIcons],
  );

  const filteredIcons = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return baseIcons;
    if (isTextIcon(trimmed)) return baseIcons;

    const query = trimmed.toLowerCase();
    const normalizedQuery = query.replace(/-/g, '');

    return baseIcons.filter((icon) => {
      const iconLower = icon.toLowerCase();
      if (iconLower.includes(query)) return true;
      return normalizedQuery !== query && iconLower.includes(normalizedQuery);
    });
  }, [baseIcons, searchQuery]);

  const totalPages = Math.ceil(filteredIcons.length / ICON_PAGE_SIZE);
  const hasPagination = totalPages > 1;

  const visibleIcons = useMemo(() => {
    const start = page * ICON_PAGE_SIZE;
    return filteredIcons.slice(start, start + ICON_PAGE_SIZE);
  }, [filteredIcons, page]);

  useEffect(() => {
    if (!hasPagination && page !== 0) setPage(0);
    const container = iconsContainerRef.current;
    if (container) container.scrollTop = 0;
  }, [hasPagination, page]);

  useEffect(() => {
    if (!hasPagination) return;
    if (page <= totalPages - 1) return;
    setPage(totalPages - 1);
  }, [hasPagination, page, totalPages]);

  const goToPage = (nextPage: number) => {
    const clamped = Math.min(Math.max(nextPage, 0), Math.max(totalPages - 1, 0));
    setPage(clamped);
    const container = iconsContainerRef.current;
    if (container) container.scrollTop = 0;
  };

  const resolveIconNameFromInput = (rawName: string): string | null => {
    const trimmed = rawName.trim();
    if (!trimmed) return null;

    if (isTextIcon(trimmed)) return trimmed;

    const resolved = resolveLucideIconName(trimmed);
    if (resolved) return resolved;

    return null;
  };

  const hasIconMatchForQuery = (rawQuery: string): boolean => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return true;
    if (isTextIcon(trimmed)) return true;

    const query = trimmed.toLowerCase();
    const normalizedQuery = query.replace(/-/g, '');

    return DEFAULT_LUCIDE_ICON_NAMES.some((icon) => {
      const iconLower = icon.toLowerCase();
      if (iconLower.includes(query)) return true;
      return normalizedQuery !== query && iconLower.includes(normalizedQuery);
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (page !== 0) setPage(0);
    const container = iconsContainerRef.current;
    if (container) container.scrollTop = 0;

    const resolved = resolveIconNameFromInput(value);
    if (resolved) {
      setSelectedIcon(resolved);
      setIsValidIcon(true);
      return;
    }

    setIsValidIcon(hasIconMatchForQuery(value));
  };

  const handleSelect = (iconName: string) => {
    setSelectedIcon(iconName);
    setIsValidIcon(true);
  };

  const handleConfirm = () => {
    onSelectIcon(selectedIcon.trim());
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('iconSelector.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
              searchQuery.trim() && !isValidIcon
                ? 'border-red-300 dark:border-red-700'
                : 'border-slate-300 dark:border-slate-600'
            } dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none`}
            autoFocus
          />
          {searchQuery.trim() && !isValidIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="text-xs text-red-500">{t('iconSelector.invalidIcon')}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollCategoryChips('left')}
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              startCategoryScrollHold('left');
            }}
            onPointerUp={stopCategoryScrollHold}
            onPointerCancel={stopCategoryScrollHold}
            onPointerLeave={stopCategoryScrollHold}
            disabled={!canScrollCategoriesLeft}
            className="shrink-0 p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            aria-label={t('common.previous')}
            title={t('common.previous')}
          >
            <ChevronLeft size={14} />
          </button>

          <div
            ref={categoryChipsRef}
            onScroll={updateCategoryScrollButtons}
            onPointerDown={handleCategoryTrackPointerDown}
            onPointerMove={handleCategoryTrackPointerMove}
            onPointerUp={stopCategoryTrackDrag}
            onPointerCancel={stopCategoryTrackDrag}
            className={`flex-1 flex gap-2 overflow-x-auto pb-1 ${
              isCategoryDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
            }`}
          >
            {availableCategories.map((item) => {
              const isActive = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleCategoryChange(item.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    isActive
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                  aria-pressed={isActive}
                >
                  {t(item.labelKey)} ({categorizedIcons[item.id].length})
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollCategoryChips('right')}
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              startCategoryScrollHold('right');
            }}
            onPointerUp={stopCategoryScrollHold}
            onPointerCancel={stopCategoryScrollHold}
            onPointerLeave={stopCategoryScrollHold}
            disabled={!canScrollCategoriesRight}
            className="shrink-0 p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            aria-label={t('common.next')}
            title={t('common.next')}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {t('iconSelector.inputIconName')}
          </span>
          <a
            href="https://lucide.dev/icons/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ExternalLink size={12} />
            Lucide Icons
          </a>
        </div>
      </div>

      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {t('iconSelector.currentSelection')}
          </span>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
            <Icon name={selectedIcon} size={18} />
            <span className="text-sm font-medium dark:text-slate-200">{selectedIcon}</span>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">{t('iconSelector.hint')}</div>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            {t('iconSelector.confirmSelection')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div ref={iconsContainerRef} className="flex-1 overflow-y-auto p-4">
          {filteredIcons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Search size={40} className="mb-3 opacity-50" />
              <p>{t('iconSelector.noMatchingIcons')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
              {visibleIcons.map((iconName) => (
                <button
                  key={iconName}
                  onClick={() => handleSelect(iconName)}
                  className={`p-4 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all ${
                    selectedIcon === iconName
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                  title={iconName}
                >
                  <Icon name={iconName} size={26} />
                  <span className="text-[12px] leading-tight w-full text-center whitespace-normal break-words">
                    {iconName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {hasPagination && (
          <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              aria-label={t('common.previous')}
              title={t('common.previous')}
            >
              <ChevronLeft size={16} />
              <span>{t('common.previous')}</span>
            </button>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t('common.page')} {page + 1} {t('common.of')} {totalPages}
            </div>

            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              aria-label={t('common.next')}
              title={t('common.next')}
            >
              <span>{t('common.next')}</span>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default IconSelector;
