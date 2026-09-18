import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './IfcViewport.css'

interface IfcViewportProps {
  // Root of the model to show (meshes carry `userData.expressID`), or null for an empty view.
  model: THREE.Object3D | null
  selectedExpressId: number | null
  // Called with the expressID of the clicked element, or null when empty space is clicked.
  onPick(expressId: number | null): void
}

interface Stage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  render(): void
}

// Clicks that move the pointer further than this are drags (rotate/pan), not picks.
const CLICK_TOLERANCE_PX = 4

const highlightMaterial = new THREE.MeshLambertMaterial({
  color: 0xff7a00,
  emissive: 0x662200,
  side: THREE.DoubleSide,
})

export function IfcViewport({ model, selectedExpressId, onPick }: IfcViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const onPickRef = useRef(onPick)
  const [unsupported] = useState(() => !isWebGLAvailable())

  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])

  // Renderer, camera, controls and picking live for the lifetime of the component.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch (error) {
      console.error('Could not create a WebGL renderer', error)
      return
    }
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef1f4)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(1, 2, 1.5)
    scene.add(sun)

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 100_000)
    camera.position.set(10, 10, 10)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false

    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)
    stageRef.current = { renderer, scene, camera, controls, render }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let down: { x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > CLICK_TOLERANCE_PX) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const root = scene.getObjectByName('ifc-model')
      const hit = root ? raycaster.intersectObject(root, true)[0] : undefined
      const id = hit?.object.userData.expressID
      onPickRef.current(typeof id === 'number' ? id : null)
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    return () => {
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      stageRef.current = null
    }
  }, [])

  // Swap the shown model and frame it. Disposing model resources is the owner's job.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !model) return
    stage.scene.add(model)
    frame(stage, model)
    return () => {
      stage.scene.remove(model)
      stage.render()
    }
  }, [model])

  // Highlight every mesh of the selected element.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !model || selectedExpressId === null) return
    const highlighted: THREE.Mesh[] = []
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.expressID === selectedExpressId) {
        obj.userData.originalMaterial = obj.material
        obj.material = highlightMaterial
        highlighted.push(obj)
      }
    })
    stage.render()
    return () => {
      for (const mesh of highlighted) mesh.material = mesh.userData.originalMaterial
      stage.render()
    }
  }, [model, selectedExpressId])

  if (unsupported) {
    return (
      <div className="viewport viewport--message" role="alert">
        Your browser does not support 3D rendering. Use Chrome or Edge.
      </div>
    )
  }

  return (
    <div className="viewport" ref={containerRef}>
      {model && (
        <button
          type="button"
          className="viewport__reset"
          onClick={() => stageRef.current && frame(stageRef.current, model)}
        >
          Reset view
        </button>
      )}
    </div>
  )
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

// Point the camera at the model's bounding box from a fixed isometric-ish direction.
function frame(stage: Stage, model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model)
  if (box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius || 1
  const { camera, controls } = stage
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))
  camera.near = distance / 1000
  camera.far = distance * 100
  camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(distance))
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
  stage.render()
}
