/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export function setDomHiddenUntilFound(dom: HTMLElement): void {
  // @ts-expect-error: "until-found" is a non-standard value not in HTMLElement types
  dom.hidden = "until-found";
}

export function domOnBeforeMatch(dom: HTMLElement, callback: () => void): void {
  // @ts-expect-error: onbeforematch is a non-standard event not in HTMLElement types
  dom.onbeforematch = callback;
}
