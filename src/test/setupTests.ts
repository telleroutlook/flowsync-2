import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

afterEach(() => {
  cleanup();
});

expect.extend(matchers);

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: () => {},
  writable: true,
});

Object.defineProperty(window, 'scrollTo', {
  value: () => {},
  writable: true,
});
