// NOTE:
// Keep all loader typing suppressions centralized here.
// Review quarterly if upstream Three.js typings become stable and remove these suppressions when viable.
// @ts-expect-error three/examples loaders are shipped without stable ESM typings in this stack.
import { STLLoader as STLLoaderRaw } from 'three/examples/jsm/loaders/STLLoader';
// @ts-expect-error three/examples loaders are shipped without stable ESM typings in this stack.
import { PLYLoader as PLYLoaderRaw } from 'three/examples/jsm/loaders/PLYLoader';
// @ts-expect-error three/examples loaders are shipped without stable ESM typings in this stack.
import { OBJLoader as OBJLoaderRaw } from 'three/examples/jsm/loaders/OBJLoader';

export const STLLoader = STLLoaderRaw;
export const PLYLoader = PLYLoaderRaw;
export const OBJLoader = OBJLoaderRaw;