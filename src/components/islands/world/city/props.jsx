// Recognisable cars and people from primitives. A car is 3.2 m long along z, 1.6 m wide and 1.2 m tall,
// with its wheels on y = 0, so it sits exactly in the physics box it stands for. A person is 1.74 m tall
// with its feet on y = 0, and its arms and legs hang from pivots so the scene can swing them with the stride.
// The glass and skin colours are fixed numbers, not token colours, because they are not part of any look.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const GLASS = new THREE.Color(0.08, 0.1, 0.13);
const SKIN = new THREE.Color(0.86, 0.7, 0.6);
const TROUSERS = new THREE.Color(0.14, 0.15, 0.2);
const TYRE = new THREE.Color(0.06, 0.06, 0.07);

export function Car({ color, lamp }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.475, 0]}>
        <boxGeometry args={[1.6, 0.55, 3.2]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh castShadow position={[0, 0.975, -0.2]}>
        <boxGeometry args={[1.36, 0.45, 1.8]} />
        <meshStandardMaterial color={GLASS} roughness={0.25} metalness={0.4} />
      </mesh>
      {[
        [-0.8, -1.0],
        [0.8, -1.0],
        [-0.8, 1.0],
        [0.8, 1.0],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} castShadow position={[x, 0.3, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.24, 14]} />
          <meshStandardMaterial color={TYRE} roughness={0.9} />
        </mesh>
      ))}
      {[-0.52, 0.52].map((x) => (
        <mesh key={x} position={[x, 0.5, -1.61]}>
          <boxGeometry args={[0.28, 0.12, 0.05]} />
          <meshStandardMaterial color={lamp} emissive={lamp} emissiveIntensity={1.5} />
        </mesh>
      ))}
    </group>
  );
}

// onLimbs receives the four pivots once, so the scene can swing them each frame.
export function Person({ shirt, onLimbs }) {
  const legL = useRef(null);
  const legR = useRef(null);
  const armL = useRef(null);
  const armR = useRef(null);
  useEffect(() => {
    onLimbs?.({ legL: legL.current, legR: legR.current, armL: armL.current, armR: armR.current });
  }, [onLimbs]);
  return (
    <group>
      <mesh castShadow position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 1.12, 0]}>
        <boxGeometry args={[0.42, 0.6, 0.24]} />
        <meshStandardMaterial color={shirt} roughness={0.8} />
      </mesh>
      <group ref={armL} position={[-0.3, 1.4, 0]}>
        <mesh castShadow position={[0, -0.3, 0]}>
          <boxGeometry args={[0.12, 0.6, 0.14]} />
          <meshStandardMaterial color={shirt} roughness={0.8} />
        </mesh>
      </group>
      <group ref={armR} position={[0.3, 1.4, 0]}>
        <mesh castShadow position={[0, -0.3, 0]}>
          <boxGeometry args={[0.12, 0.6, 0.14]} />
          <meshStandardMaterial color={shirt} roughness={0.8} />
        </mesh>
      </group>
      <group ref={legL} position={[-0.11, 0.8, 0]}>
        <mesh castShadow position={[0, -0.4, 0]}>
          <boxGeometry args={[0.16, 0.8, 0.18]} />
          <meshStandardMaterial color={TROUSERS} roughness={0.9} />
        </mesh>
      </group>
      <group ref={legR} position={[0.11, 0.8, 0]}>
        <mesh castShadow position={[0, -0.4, 0]}>
          <boxGeometry args={[0.16, 0.8, 0.18]} />
          <meshStandardMaterial color={TROUSERS} roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}
