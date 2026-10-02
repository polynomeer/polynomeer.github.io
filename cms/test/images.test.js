import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_BYTES, IMAGE_DIR, WARN_BYTES,
  extensionFor, formatSize, imageFileName, isSupported,
  markdownFor, publicUrl, sizeLevel, uniqueImagePath
} from '../src/ui/images.js';

test('the extension comes from the declared type, not the filename', () => {
  assert.equal(imageFileName('photo.JPEG', 'image/jpeg'), 'photo.jpg');
  assert.equal(imageFileName('shot.png', 'image/webp'), 'shot.webp');
  // A name with no extension at all still gets one.
  assert.equal(imageFileName('diagram', 'image/png'), 'diagram.png');
});

test('a filename that is not usable as a path is made into one', () => {
  assert.equal(
    imageFileName('스크린샷 2026-10-02 오후 3.14.15.png', 'image/png'),
    '스크린샷-2026-10-02-오후-3-14-15.png'
  );
  assert.equal(imageFileName('../../etc/passwd.png', 'image/png'), 'etc-passwd.png');
  assert.equal(imageFileName('***.png', 'image/png'), 'image.png');
  assert.equal(imageFileName('', 'image/png'), 'image.png');
});

test('an unsupported type is refused rather than guessed at', () => {
  assert.equal(extensionFor('application/pdf'), null);
  assert.equal(extensionFor('image/bmp'), null);
  assert.equal(imageFileName('x.bmp', 'image/bmp'), null);
  assert.equal(isSupported('image/png'), true);
  assert.equal(isSupported('text/html'), false);
});

test('a name already in the repository is never reused', () => {
  const taken = [`${IMAGE_DIR}/a.png`, `${IMAGE_DIR}/a-2.png`];
  assert.equal(uniqueImagePath('a.png', taken), `${IMAGE_DIR}/a-3.png`);
  assert.equal(uniqueImagePath('b.png', taken), `${IMAGE_DIR}/b.png`);
  assert.equal(uniqueImagePath('a.png', []), `${IMAGE_DIR}/a.png`);
});

test('the suffix goes before the extension, not after it', () => {
  assert.equal(
    uniqueImagePath('chart.svg', [`${IMAGE_DIR}/chart.svg`]),
    `${IMAGE_DIR}/chart-2.svg`
  );
});

test('the committed path and the url a page asks for differ by one slash', () => {
  assert.equal(publicUrl(`${IMAGE_DIR}/a.png`), `/${IMAGE_DIR}/a.png`);
  assert.equal(publicUrl(`/${IMAGE_DIR}/a.png`), `/${IMAGE_DIR}/a.png`);
});

test('brackets in the alt text cannot break out of the markdown', () => {
  // `]` is the only character that could end the alt early and let the rest
  // be read as a link target. Parentheses inside the alt cannot.
  assert.equal(
    markdownFor(`${IMAGE_DIR}/a.png`, 'a](javascript:x) ['),
    `![a(javascript:x) ](/${IMAGE_DIR}/a.png)`
  );
});

test('the size thresholds are the ones the image audit reports on', () => {
  assert.equal(WARN_BYTES, 300 * 1024);
  assert.equal(CRITICAL_BYTES, 800 * 1024);
  assert.equal(sizeLevel(WARN_BYTES - 1), 'ok');
  assert.equal(sizeLevel(WARN_BYTES), 'warn');
  assert.equal(sizeLevel(CRITICAL_BYTES), 'critical');
});

test('a size is readable at both ends of the range', () => {
  assert.equal(formatSize(900), '1 KB');
  assert.equal(formatSize(300 * 1024), '300 KB');
  assert.equal(formatSize(2.5 * 1024 * 1024), '2.5 MB');
});
