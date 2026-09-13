// Shared 3D post-processing + lighting, used by BOTH the architecture scene and the
// Claude Setup exhibit. One module, because the two scenes were already duplicating
// their scaffolding and a polish pass would otherwise have to fix everything twice.
//
// WHY THIS EXISTS — the single biggest defect in the 3D work:
//
// Both scenes were written *as if bloom existed*. Every node material carries an
// `emissive` colour; `emissiveIntensity` runs as high as 1.5 on the flow packets and
// the reactor core; those same materials set `toneMapped={false}` specifically so they
// could blow out past white. But there was NO post-processing pass in either scene — so
// all of that got clipped straight to flat, slightly-brighter fill. Every glow the code
// was reaching for was being computed and then thrown away, which is exactly why the
// meshes read as matte plastic.
//
// Bloom is what those values were always for. It comes from three's OWN bundle
// (`three/examples/jsm/*`), so this adds ZERO new dependencies and does not touch
// DECISIONS.md D14 ("no second 3D library") — @react-three/postprocessing would have
// been a nicer API and a new package; this is neither.
import { useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Selective bloom by luminance threshold.
 *
 * `threshold` is the whole trick: only pixels brighter than it bloom. Set it above the
 * scene's dim/off-state fill and below its emissive highlights, and the glow lands on
 * exactly the things that are meant to be emitting — lit nodes, the reactor core, the
 * travelling flow packets — while dimmed, off-step geometry stays matte. That is what
 * makes it read as "these parts are energised" rather than "someone turned on a filter".
 */
export function Bloom({ strength = 0.9, radius = 0.62, threshold = 0.5 }) {
  const { gl, scene, camera, size, viewport } = useThree();

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(
      new UnrealBloomPass(new THREE.Vector2(size.width, size.height), strength, radius, threshold),
    );
    // OutputPass performs tone-mapping + colour-space conversion at the END of the chain.
    // Without it the composer writes linear colour straight to the canvas and the whole
    // scene renders washed-out and grey.
    c.addPass(new OutputPass());
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setPixelRatio(viewport.dpr);
    composer.setSize(size.width, size.height);
  }, [composer, size, viewport.dpr]);

  useEffect(() => () => composer.dispose(), [composer]);

  // A POSITIVE priority takes over the render loop: react-three-fiber stops issuing its
  // own automatic gl.render() and this becomes the one that draws the frame. Miss this
  // and you get either a black canvas (nothing renders) or double-rendering.
  useFrame(() => composer.render(), 1);

  return null;
}

/**
 * A procedural studio environment.
 *
 * The node materials set `metalness: 0.15`, but a physically-based material with NOTHING
 * to reflect just renders darker — the metalness was actively costing them. An env map is
 * what gives it something to reflect, which is the difference between "plastic" and
 * "machined".
 *
 * RoomEnvironment is generated in-process from three's own bundle, so this fetches nothing:
 * the Content-Security-Policy on this site is `connect-src 'self'`, which would block any
 * CDN-hosted HDRI (drei's <Environment preset> loads from a CDN and would fail here).
 *
 * `environmentIntensity` is kept low — the env is here for specular response, not to light
 * the scene. Turned up, it flattens the emissive contrast the bloom depends on.
 */
export function StudioEnv({ intensity = 0.35 }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);

  return null;
}
