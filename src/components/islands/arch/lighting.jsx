// Shared 3D lighting, used by BOTH the architecture scene and the Claude Setup exhibit.
// One module, because the two scenes share their scaffolding and a change to how they are
// lit would otherwise have to be made twice.
//
// LIT AND SHADED, NO BLOOM — the operator's pick of 2026-09-24 (DECISIONS.md D68).
//
// This file was `postfx.jsx` and carried an UnrealBloom pass, written for the dark ground
// the site had then. Bloom only ever ADDS light. On the light ground the site took on
// 2026-08-26 (D63) it had nothing to add to, and the self-lit `toneMapped={false}`
// materials it was tuned for washed out to near-white instead. Measured 2026-09-24 in
// headless Chromium on the live site: 0.3% of the setup exhibit and 0.1% of an
// architecture scene rendered darker than mid-grey, with every label floating over a
// ghost (polish-pass trap #33). On paper nothing emits. Form comes from shading instead:
// objects darker than their ground, a key light from above and to one side, a soft fill,
// and a real shadow on the floor.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * The paper rig.
 *
 * A sky/ground fill keeps every face readable, so no side of an object goes black. One key
 * light casts the scene's shadows, and a weak light from the opposite side separates the
 * shaded faces from the background. `span` is the half-width the key light's shadow must
 * cover: too small clips shadows at the edge, too large spreads the shadow map thinner and
 * blurs them.
 */
export function PaperLights({ sky, ground, span = 7 }) {
  return (
    <>
      <hemisphereLight args={[sky, ground, 1.1]} />
      <directionalLight
        position={[5, 9, 6]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
      />
      <directionalLight position={[-6, 3, -5]} intensity={0.45} />
    </>
  );
}

/**
 * A floor that shows nothing except the shadows falling on it. On paper a cast shadow is
 * the strongest depth cue left, and it is what makes the rig read as standing on something
 * rather than floating.
 */
export function ShadowFloor({ y, size = 40, opacity = 0.14 }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y + 0.001, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <shadowMaterial transparent opacity={opacity} />
    </mesh>
  );
}

/**
 * A procedural studio environment, for specular response only.
 *
 * A physically based material with NOTHING to reflect renders flatter than it should; an
 * env map gives the lit faces a soft highlight. RoomEnvironment is generated in-process
 * from three's own bundle, so this fetches nothing: the Content-Security-Policy on this
 * site is `connect-src 'self'`, which would block any CDN-hosted HDRI (drei's
 * <Environment preset> loads from a CDN and would fail here).
 *
 * `environmentIntensity` stays low, because the paper rig above does the lighting.
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
