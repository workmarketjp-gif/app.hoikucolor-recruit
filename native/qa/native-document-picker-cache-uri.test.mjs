import assert from 'node:assert/strict';
import test from 'node:test';
import { isDocumentPickerCacheUriWithinDirectory as within } from '../src/lib/documentPickerCacheUri.ts';

const cache = 'file:///var/mobile/Containers/Data/Application/ABC/Library/Caches';

test('real private cache files including OS picker folders and escaped Japanese filenames are accepted', () => {
  for (const suffix of ['/picked.pdf', '/DocumentPicker/picked.pdf', '/Photo%20ID.jpg', '/%E5%B1%A5%E6%AD%B4%E6%9B%B8.pdf']) {
    assert.equal(within(cache + suffix, cache), true, suffix);
  }
});
test('lookalike directory and dot segments are not private cache files', () => {
  for (const suffix of ['', 'x/evil.pdf', '/../Documents/private.pdf', '/./private.pdf', '/folder/../private.pdf', '/folder//private.pdf']) {
    assert.equal(within(cache + suffix, cache), false, suffix);
  }
  assert.equal(within('file:///var/mobile/Containers/Data/Application/ABC/Library/Caches2/private.pdf', cache), false);
});
test('encoded and double-encoded traversal and separators are rejected', () => {
  for (const path of ['/..%2FDocuments/private.pdf', '/%2e%2e/private.pdf', '/x/%2E%2E/private.pdf',
    '/x%5C..%5Cprivate.pdf', '/%252e%252e/private.pdf', '/x%252fprivate.pdf', '/%00secret.pdf', '/bad%ZZ.pdf']) {
    assert.equal(within(cache + path, cache), false, path);
  }
});
test('query, fragment, foreign schemes and invalid values are rejected', () => {
  for (const value of [cache + '/file.pdf?key=1', cache + '/file.pdf#part', cache + '/foo\\bar',
    'content://provider/private.pdf', 'https://example.com/file.pdf', null, 42, {}]) {
    assert.equal(within(value, cache), false, String(value));
  }
});
test('root must be local and supports an existing trailing slash', () => {
  assert.equal(within(cache + '/picked.pdf', cache + '/'), true);
  assert.equal(within(cache + '/picked.pdf', 'https://example.com/cache'), false);
  assert.equal(within(cache + '/picked.pdf', ''), false);
});
