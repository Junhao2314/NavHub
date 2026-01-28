export const TOAST_AUTO_DISMISS_MS = 2600;

export const SIDEBAR_TYPEWRITER_MS = {
  typeSpeed: 150,
  deleteSpeed: 100,
  navPause: 5000,
  timePauseMin: 3000,
  timePauseMax: 6000,
} as const;

export const SIDEBAR_SHOW_DATE_PROBABILITY = 0.2;

// NOTE: used as a simple viewport clamp so the menu doesn't overflow right/bottom.
// It doesn't represent the actual DOM size of the context menu.
export const CONTEXT_MENU_VIEWPORT_GUARD_PX = {
  width: 400,
  height: 300,
} as const;

export const CLOCK_TICK_MS = 1000;

export const MOVE_MENU_WIDTH_PX = 176;
export const MOVE_MENU_PADDING_PX = 8;
export const MOVE_MENU_OFFSET_PX = 8;
export const MOVE_MENU_CLOSE_DELAY_MS = 120;

export const LINK_MODAL_SUCCESS_MESSAGE_HIDE_MS = 1000;
export const LINK_MODAL_AUTO_FETCH_ICON_DELAY_MS = 500;
export const LINK_MODAL_TAG_SUGGESTIONS_HIDE_DELAY_MS = 150;

export const SYNC_STATUS_AUTO_HIDE_DELAY_MS = 2500;
export const SYNC_STATUS_EXIT_ANIMATION_MS = 300;

export const AI_CONNECTION_STATUS_RESET_MS = 3000;
