import { Vector3, Quaternion } from '@dcl/sdk/math'
import { engine, Transform, VirtualCamera, MainCamera, TriggerArea, triggerAreaEventsSystem } from '@dcl/sdk/ecs'
import { WorkStation, FuelType } from './workStation'
import { StorageStation } from './storageStation'
import { setMessage, getMessage, clearMessage } from './ui'

// Función para configurar la cámara cinematográfica
export function setupCinematicCamera() {
  // Crear entidad para la cámara cinematográfica
  const cinematicCamera = engine.addEntity()

  // Posicionar la cámara en la frontera de la escena (8, 20, 0) y apuntar al centro
  // Para una escena de 16x16, el centro está en (8, 0, 8)
  const cameraPosition = Vector3.create(8, 10, -2) // Frontera sur de la escena, 20m arriba
  const targetPoint = Vector3.create(8, 0, 8) // Centro de la escena
  
  // Calcular dirección desde la cámara hacia el centro
  const direction = Vector3.subtract(targetPoint, cameraPosition)
  const normalizedDirection = Vector3.normalize(direction)
  
  // Usar lookRotation para apuntar hacia el centro de la escena
  Transform.create(cinematicCamera, {
    position: cameraPosition,
    rotation: Quaternion.lookRotation(normalizedDirection)
  })

  // Configurar la cámara virtual cinematográfica
  VirtualCamera.create(cinematicCamera, {
    defaultTransition: {
      transitionMode: VirtualCamera.Transition.Speed(5.0)
    }
  })

  // Activar la cámara virtual inmediatamente
  MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = cinematicCamera

  // Crear una zona de trigger que cubre toda la escena para mantener la cámara activa
  const cameraTriggerArea = engine.addEntity()
  Transform.create(cameraTriggerArea, {
    position: Vector3.create(8, 0, 8), // Centro de la escena
    scale: Vector3.create(16, 20, 16) // Cubre toda la escena (16x16) y altura suficiente
  })
  
  // Crear el área de trigger (box)
  TriggerArea.setBox(cameraTriggerArea)

  // Cuando el jugador entra en el área, activar la cámara cinematográfica
  triggerAreaEventsSystem.onTriggerEnter(cameraTriggerArea, () => {
    MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = cinematicCamera
  })

  // Mantener la cámara activa mientras el jugador está en el área
  triggerAreaEventsSystem.onTriggerStay(cameraTriggerArea, () => {
    const mainCamera = MainCamera.getMutable(engine.CameraEntity)
    if (mainCamera.virtualCameraEntity !== cinematicCamera) {
      mainCamera.virtualCameraEntity = cinematicCamera
    }
  })

  // La cámara está configurada como estática y no seguirá al personaje
  // La posición y rotación están fijas, creando una vista topdown cinematográfica
}

// Variable para el temporizador del mensaje
let messageTimer: number = 0
const MESSAGE_DURATION = 3.0 // segundos

// Sistema para manejar el temporizador del mensaje
engine.addSystem((dt: number) => {
  try {
    const currentMessage = getMessage()
    if (currentMessage !== '') {
      messageTimer += dt
      if (messageTimer >= MESSAGE_DURATION) {
        clearMessage()
        messageTimer = 0
      }
    }
  } catch (error) {
    // Silenciar errores para no detener la ejecución
    console.error('Error en messageTimerSystem:', error)
    clearMessage()
    messageTimer = 0
  }
}, 0, 'messageTimerSystem')

// Función para mostrar un mensaje en la UI inferior de la pantalla
export function showUIMessage(message: string) {
  setMessage(message)
  messageTimer = 0
}

// Función para crear las 3 WorkStations
export function createWorkStations() {
  // Anvil (Yunque) - usando WATER como combustible
  new WorkStation(
    {
      position: Vector3.create(10, 0, 10),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/anvil/Anvil_01/Anvil_01.glb',
    FuelType.WATER,
    10, // maxFuel
    3.0, // consumptionInterval
    5.0, // workDuration (segundos)
    'assets/asset-packs/anvil/Anvil_01/Anvil_01.glb', // resultModel (por ahora el mismo modelo, puedes cambiarlo)
    () => showUIMessage('Anvil is out of fuel!'),
    undefined,
    showUIMessage
  )

  // Salamander Stove (Salamandra) - usando COAL como combustible
  new WorkStation(
    {
      position: Vector3.create(14.5, 0, 9.2),
      rotation: Quaternion.fromEulerDegrees(0, 240, 0),
      scale: Vector3.create(3, 3, 3)
    },
    'assets/asset-packs/salamander_stove/Stove_01/Stove_01.glb',
    FuelType.COAL,
    10, // maxFuel
    3.0, // consumptionInterval
    5.0, // workDuration (segundos)
    'assets/asset-packs/salamander_stove/Stove_01/Stove_01.glb', // resultModel
    () => showUIMessage('Stove is out of fuel!'),
    undefined,
    showUIMessage
  )

  // Potion Cauldron (Caldero) - usando WOOD como combustible
  new WorkStation(
    {
      position: Vector3.create(5, 0, 10),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1.25, 1.25, 1.25)
    },
    'assets/asset-packs/potion_cauldron/Cauldron_01/Cauldron_01.glb',
    FuelType.WOOD,
    10, // maxFuel
    3.0, // consumptionInterval
    5.0, // workDuration (segundos)
    'assets/asset-packs/potion_cauldron/Cauldron_01/Cauldron_01.glb', // resultModel
    () => showUIMessage('Cauldron is out of fuel!'),
    undefined,
    showUIMessage
  )
}

// Función para crear las 3 StorageStations
export function createStorageStations() {
  // Bucket (Cubo) - usando WATER
  new StorageStation(
    {
      position: Vector3.create(11, 0, 9),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/bucket/Bucket.glb',
    FuelType.WATER,
    showUIMessage
  )

  // Logs 3 (Leños) - usando WOOD
  new StorageStation(
    {
      position: Vector3.create(13, 0, 5),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/logs_3/Logs 3.glb',
    FuelType.WOOD,
    showUIMessage
  )

  // Mines Cart Coal (Carro de Carbón) - usando COAL
  new StorageStation(
    {
      position: Vector3.create(14.5, 0, 8 ),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/mines_cart_coal/Mines Cart Coal.glb',
    FuelType.COAL,
    showUIMessage
  )
}

