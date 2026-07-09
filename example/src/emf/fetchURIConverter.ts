/**
 * Browser-tauglicher URIConverter der fetch() nutzt.
 * Ersetzt den Node.js-basierten Default-Converter von BasicResourceSet.
 */
import type { URIConverter } from '@emfts/core';
import { URI } from '@emfts/core';

export const fetchURIConverter: URIConverter = {
  normalize(uri: URI): URI {
    // Relative URIs gegen window.location auflösen
    const str = uri.toString();
    if (str.startsWith('http://') || str.startsWith('https://')) return uri;
    return URI.createURI(new URL(str, window.location.href).toString());
  },

  async createInputStream(uri: URI): Promise<ReadableStream> {
    const url = this.normalize(uri).toString();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[fetchURIConverter] HTTP ${response.status} for ${url}`);
    }
    if (!response.body) {
      // Fallback: wrap text as stream
      const text = await response.text();
      return new Response(text).body!;
    }
    return response.body;
  },

  async createOutputStream(_uri: URI): Promise<WritableStream> {
    throw new Error('[fetchURIConverter] createOutputStream not supported in browser');
  },

  async exists(uri: URI): Promise<boolean> {
    try {
      const response = await fetch(this.normalize(uri).toString(), { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  },

  async delete(_uri: URI): Promise<void> {
    throw new Error('[fetchURIConverter] delete not supported in browser');
  },
};
