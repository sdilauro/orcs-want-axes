import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { engine, Transform, VirtualCamera, MainCamera, TriggerArea, triggerAreaEventsSystem, ColliderLayer, AvatarShape, Tween, EasingFunction, Entity, pointerEventsSystem, InputAction, MeshCollider, Billboard, BillboardMode, MeshRenderer, Material as MaterialECS, AvatarModifierArea, AvatarModifierType, GltfContainer, Schemas, AvatarAttach, AvatarAnchorPointType } from '@dcl/sdk/ecs'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { EntityNames } from '../assets/scene/entity-names'
import { uiComponent, setMessage, getMessage, clearMessage } from './ui'

// Componente custom para identificar mineral de hierro (ore) - Definido fuera de main() para evitar errores de "Engine sealed"
const IronOreSchema = {
  id: Schemas.String
}
const IronOre = engine.defineComponent('IronOre', IronOreSchema)

export function main() {
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

  // Nota: En SDK7 no hay un modificador específico para ocultar solo los name tags
  // La solución es establecer el nombre como cadena vacía o usar un carácter especial
  // que haga que el name tag no se muestre


  // Función para verificar si el jugador tiene hierbas attachadas (solo se llama al hacer clic)
  function hasMaterialAttached(materialId: string): boolean {
    try {
      // Buscar todas las entidades con AvatarAttach
      for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
        // Verificar si está attacheado a la mano derecha del jugador
        if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
          // Verificar si tiene el componente IronOre con el id especificado
          if (IronOre.has(entity)) {
            const item = IronOre.get(entity)
            if (item && item.id === materialId) {
              return true
            }
          }
        }
      }
    } catch (error) {
      // Silenciar errores para no detener la ejecución
      console.error('Error en hasMaterialAttached:', error)
    }
    return false
  }

  // Función para verificar si el jugador tiene algo attachado a la mano derecha
  function hasSomethingInRightHand(): boolean {
    try {
      // Buscar todas las entidades con AvatarAttach
      for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
        // Verificar si está attacheado a la mano derecha del jugador
        if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
          return true
        }
      }
    } catch (error) {
      // Silenciar errores para no detener la ejecución
      console.error('Error en hasSomethingInRightHand:', error)
    }
    return false
  }

  // Función para eliminar la entidad attachada a la mano derecha
  function removeRightHandItem() {
    try {
      // Buscar todas las entidades con AvatarAttach
      for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
        // Verificar si está attacheado a la mano derecha del jugador
        if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
          // Eliminar la entidad
          engine.removeEntity(entity)
          return
        }
      }
    } catch (error) {
      // Silenciar errores para no detener la ejecución
      console.error('Error en removeRightHandItem:', error)
    }
  }

  // Función para attachar un cubo a la mano derecha con un id específico
  function attachCubeToRightHand(itemId: string) {
    try {
      // Crear entidad para el cubo
      const cube = engine.addEntity()
      
      // Crear un cubo gris
      MeshRenderer.setBox(cube)
      MaterialECS.setPbrMaterial(cube, {
        albedoColor: Color4.create(0.5, 0.5, 0.5, 1.0) // Gris
      })
      
      // Agregar el componente IronOre con el id especificado
      IronOre.create(cube, {
        id: itemId
      })
      
      // Attachear a la mano derecha del jugador
      AvatarAttach.create(cube, {
        anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
      })
    } catch (error) {
      // Silenciar errores para no detener la ejecución
      console.error('Error en attachCubeToRightHand:', error)
    }
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
  function showUIMessage(message: string) {
    setMessage(message)
    messageTimer = 0
  }

  // Configurar el renderer de UI
  ReactEcsRenderer.setUiRenderer(uiComponent)

  // Definir los 3 spots
  const spots = [
    { id: 0, position: Vector3.create(9.75, 0, 15), occupied: false },
    { id: 1, position: Vector3.create(8.1, 0, 15), occupied: false },
    { id: 2, position: Vector3.create(6.5, 0, 15), occupied: false }
  ]

  // Hacer interactuables el Anvil, Salamander Stove y Potion Cauldron
  const anvil = engine.getEntityOrNullByName(EntityNames.Anvil)
  const salamanderStove = engine.getEntityOrNullByName(EntityNames.Salamander_Stove)
  const potionCauldron = engine.getEntityOrNullByName(EntityNames.Potion_Cauldron)

  // Función helper para hacer una entidad interactuable
  function makeInteractable(entity: Entity | null, hoverText: string, onInteract: () => void) {
    if (!entity) return
    
    // Agregar collider para hacer la entidad interactuable
    if (!MeshCollider.has(entity)) {
      MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
    }
    
    // Agregar evento de click
    pointerEventsSystem.onPointerDown(
      {
        entity: entity,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: hoverText
        }
      },
      onInteract
    )
  }

  // Crear 3 entidades con el modelo del chest, ubicadas frente a los spots a 10m de distancia
  // Los spots están en Z=15, y "frente" significa hacia la cámara (sur, Z negativo)
  // A 10m de distancia: Z = 15 - 10 = 5
  const chestModelPath = 'assets/asset-packs/chest/Trunk_01/Trunk_01.glb'
  const chests: Entity[] = []
  const chestItemIds = ['ore', 'herb', 'metal'] // IDs para cada chest
  
  for (let i = 0; i < 3; i++) {
    const chest = engine.addEntity()
    const spotPos = spots[i].position
    
    // Posicionar el chest frente al spot, a 10m de distancia (hacia el sur)
    Transform.create(chest, {
      position: Vector3.create(spotPos.x, 0, spotPos.z - 10),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    })
    
    // Cargar el modelo del chest
    GltfContainer.create(chest, {
      src: chestModelPath,
      visibleMeshesCollisionMask: 0,
      invisibleMeshesCollisionMask: 3
    })
    
    // Guardar referencia al chest
    chests.push(chest)
    
    // Hacer el chest interactuable
    const itemId = chestItemIds[i]
    const hoverText = `Take some ${itemId}`
    makeInteractable(chest, hoverText, () => {
      if (hasSomethingInRightHand()) {
        showUIMessage('You already have something in your hand')
      } else {
        attachCubeToRightHand(itemId)
      }
    })
  }

  // Hacer el Anvil interactuable
  makeInteractable(anvil, 'Use Anvil', () => {
    if (hasMaterialAttached('metal')) {
      showUIMessage('Starting to forge')
      removeRightHandItem()
    } else {
      showUIMessage('Need a piece of metal to forge')
    }
  })

  // Hacer el Salamander Stove interactuable
  makeInteractable(salamanderStove, 'Use Stove', () => {
    if (hasMaterialAttached('ore')) {
      showUIMessage('Starting to smelt')
      removeRightHandItem()
    } else {
      showUIMessage('Need some iron ores to smelt')
    }
  })

  // Hacer el Potion Cauldron interactuable
  makeInteractable(potionCauldron, 'Use Cauldron', () => {
    if (hasMaterialAttached('herb')) {
      showUIMessage('Starting to brew')
      removeRightHandItem()
    } else {
      showUIMessage('Need some herbs to brew')
    }
  })

  // Puntos de origen (este y oeste)
  const originEast = Vector3.create(14, 0, 18)
  const originWest = Vector3.create(2, 0, 18)

  // Función para obtener un spot libre
  function getFreeSpot(): { id: number, position: Vector3 } | null {
    for (const spot of spots) {
      if (!spot.occupied) {
        return { id: spot.id, position: spot.position }
      }
    }
    return null
  }

  // Función para marcar un spot como ocupado
  function occupySpot(spotId: number) {
    const spot = spots.find(s => s.id === spotId)
    if (spot) {
      spot.occupied = true
    }
  }

  // Función para liberar un spot
  function freeSpot(spotId: number) {
    const spot = spots.find(s => s.id === spotId)
    if (spot) {
      spot.occupied = false
    }
  }

  // Función para determinar el punto de origen más cercano al spot
  function getClosestOrigin(spotPos: Vector3): Vector3 {
    const distToEast = Vector3.distance(originEast, spotPos)
    const distToWest = Vector3.distance(originWest, spotPos)
    return distToEast < distToWest ? originEast : originWest
  }

  // Función para calcular la rotación hacia el destino
  function getRotationToTarget(from: Vector3, to: Vector3): Quaternion {
    const direction = Vector3.subtract(to, from)
    const normalized = Vector3.normalize(direction)
    return Quaternion.lookRotation(normalized)
  }

  // Arrays de nombres élficos y orcos
  const elfNames = [
    'Ael', 'Thal', 'Lyr', 'Nim', 'Eir', 'Sil', 'Fen', 'Ril', 'Ara', 'Val',
    'Ith', 'Quel', 'Elen', 'Gal', 'Mir', 'Nen', 'Riv', 'Tel', 'Van', 'Yav'
  ]
  
  const orcNames = [
    'Gruk', 'Thak', 'Zog', 'Mog', 'Rag', 'Dug', 'Gash', 'Krag', 'Snag', 'Thug',
    'Urg', 'Vog', 'Zug', 'Bog', 'Frag', 'Grog', 'Hag', 'Jag', 'Nag', 'Pog'
  ]

  // Función para generar un nombre combinando 2 strings del mismo array
  function generateName(nameArray: string[]): string {
    const first = nameArray[Math.floor(Math.random() * nameArray.length)]
    const second = nameArray[Math.floor(Math.random() * nameArray.length)]
    return `${first} ${second}` // Separar con espacio
  }

  // Función para generar un color de piel de elfo (tonos claros con variación)
  function generateElfSkinColor(): Color3 {
    const r = 0.85 + Math.random() * 0.13 // Rango: 0.85 - 0.98
    const g = 0.80 + Math.random() * 0.12 // Rango: 0.80 - 0.92
    const b = 0.70 + Math.random() * 0.15 // Rango: 0.70 - 0.85
    return Color3.create(r, g, b)
  }

  // Función para generar un color de piel de orco (tonos verdes con variación)
  function generateOrcSkinColor(): Color3 {
    const r = 0.2 + Math.random() * 0.2  // Rango: 0.2 - 0.4
    const g = 0.5 + Math.random() * 0.2  // Rango: 0.5 - 0.7
    const b = 0.3 + Math.random() * 0.2  // Rango: 0.3 - 0.5
    return Color3.create(r, g, b)
  }

  // Función para crear un plano blanco arriba del avatar (preparado para sprite futuro)
  function createAvatarPlane(parentEntity: Entity, spritePath?: string) {
    const plane = engine.addEntity()
    
    // Crear el plano como hijo del avatar, posicionado 0.5 metros más arriba que la cabeza
    // La cabeza del avatar está aproximadamente a 1.5m del suelo, así que 1.5 + 0.5 = 2.0m
    Transform.create(plane, {
      position: Vector3.create(0, 2.25, 0), // 0.5 metros más arriba que la cabeza (1.5m + 0.5m)
      scale: Vector3.create(0.5, 0.5, 1), // 0.5 x 0.5 metros
      parent: parentEntity
    })
    
    // Crear el plano
    MeshRenderer.setPlane(plane)
    
    // Aplicar material blanco (o sprite si se proporciona)
    if (spritePath) {
      // Si hay sprite, usar textura
      MaterialECS.setBasicMaterial(plane, {
        texture: MaterialECS.Texture.Common({ src: spritePath })
      })
    } else {
      // Si no hay sprite, usar color blanco sólido
      MaterialECS.setBasicMaterial(plane, {
        diffuseColor: Color4.White()
      })
    }
    
    // Agregar componente Billboard para que siempre mire a la cámara
    Billboard.create(plane, {
      billboardMode: BillboardMode.BM_Y // Solo rotar en Y (más común)
    })
    
    return plane
  }

  // Función para crear un NPC que camina hacia un spot
  function createWalkingNPC(npcId: number, spotId: number, spotPos: Vector3, walkDuration: number) {
    // Marcar el spot como ocupado inmediatamente al crear el NPC
    occupySpot(spotId)
    
    const npc = engine.addEntity()
    
    // Determinar punto de origen más cercano al spot
    const startPos = getClosestOrigin(spotPos)
    
    // Seleccionar aleatoriamente entre elfo u orco
    const isElf = Math.random() < 0.5
    const nameArray = isElf ? elfNames : orcNames
    const npcName = generateName(nameArray)
    
    // Determinar color de piel según la raza (con variación)
    const skinColor = isElf 
      ? generateElfSkinColor()  // Piel clara con variación
      : generateOrcSkinColor()  // Tono verde con variación
    
    // Crear avatar con apariencia variada
    const bodyShapes = [
      'urn:decentraland:off-chain:base-avatars:BaseMale',
      'urn:decentraland:off-chain:base-avatars:BaseFemale'
    ]
    const wearables = [
      ['urn:decentraland:off-chain:base-avatars:blue_tshirt', 'urn:decentraland:off-chain:base-avatars:brown_pants'],
      ['urn:decentraland:off-chain:base-avatars:red_tshirt', 'urn:decentraland:off-chain:base-avatars:black_pants'],
      ['urn:decentraland:off-chain:base-avatars:green_hoodie', 'urn:decentraland:off-chain:base-avatars:jeans'],
      ['urn:decentraland:off-chain:base-avatars:yellow_tshirt', 'urn:decentraland:off-chain:base-avatars:blue_pants']
    ]
    
    // Wearables de pelo largo para elfos
    const longHairStyles = [
      'urn:decentraland:off-chain:base-avatars:f_afro',
      'urn:decentraland:off-chain:base-avatars:f_curly_hair',
      'urn:decentraland:off-chain:base-avatars:f_ponytail',
      'urn:decentraland:off-chain:base-avatars:f_long_hair',
      'urn:decentraland:off-chain:base-avatars:standard_hair'
    ]
    
    // Wearables de pelo corto para orcos
    const shortHairStyles = [
      'urn:decentraland:off-chain:base-avatars:short_hair',
      'urn:decentraland:off-chain:base-avatars:male_mohawk',
      'urn:decentraland:off-chain:base-avatars:male_bun',
      'urn:decentraland:off-chain:base-avatars:casual_hair_01',
      'urn:decentraland:off-chain:base-avatars:casual_hair_02'
    ]
    
    const bodyShape = bodyShapes[npcId % bodyShapes.length]
    const wearableSet = [...wearables[npcId % wearables.length]]
    
    // Agregar pelo según la raza
    const hairStyles = isElf ? longHairStyles : shortHairStyles
    const selectedHair = hairStyles[Math.floor(Math.random() * hairStyles.length)]
    wearableSet.push(selectedHair)
    
    // Generar un ID con formato de address válido para que el sistema reconozca el nombre como claimado
    // Formato: 0x seguido de 40 caracteres hexadecimales (42 caracteres total)
    const addressId = `0x${Array.from({ length: 40 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`
    
    AvatarShape.create(npc, {
      id: addressId, // Usar formato de address para indicar nombre claimado
      name: '', // Establecer nombre vacío para ocultar el name tag
      bodyShape: bodyShape,
      wearables: wearableSet,
      skinColor: skinColor,
      emotes: []
    })
    
    // Crear plano blanco arriba del avatar (preparado para sprite futuro)
    // Puedes pasar un spritePath opcional: createAvatarPlane(npc, 'sprites/icon.png')
    createAvatarPlane(npc)
    
    // Función para hacer que el NPC vuelva a su punto de origen
    function sendNPCBack() {
      // Liberar el spot
      freeSpot(spotId)
      
      // Eliminar cualquier tween activo
      if (Tween.has(npc)) {
        Tween.deleteFrom(npc)
      }
      
      // Obtener posición actual
      const currentPos = Transform.get(npc).position
      
      // Calcular rotación hacia el punto de origen
      const rotationToOrigin = getRotationToTarget(currentPos, startPos)
      Transform.getMutable(npc).rotation = rotationToOrigin
      
      // Calcular duración del movimiento de vuelta
      const distance = Vector3.distance(currentPos, startPos)
      const speed = 1.2 // metros por segundo
      const returnDuration = (distance / speed) * 1000 // convertir a milisegundos
      
      // Crear tween para volver al punto de origen
      Tween.setMove(
        npc,
        currentPos,
        startPos,
        returnDuration,
        EasingFunction.EF_LINEAR
      )
      
      // Sistema para detectar cuando el NPC llega al origen y eliminarlo
      const returnSystemName = `checkReturn-${npcId}`
      engine.addSystem((dt: number) => {
        if (!Transform.has(npc)) {
          engine.removeSystem(returnSystemName)
          return
        }
        
        const transform = Transform.get(npc)
        const distance = Vector3.distance(transform.position, startPos)
        
        // Si está muy cerca del origen (menos de 0.1m), eliminar el NPC
        if (distance < 0.1) {
          engine.removeEntity(npc)
          engine.removeSystem(returnSystemName)
        }
      }, 0, returnSystemName)
    }
    
    // Calcular rotación hacia el destino
    const rotation = getRotationToTarget(startPos, spotPos)
    
    // Posicionar NPC en el punto de inicio
    Transform.create(npc, {
      position: startPos,
      rotation: rotation
    })
    
    // Crear una entidad hija invisible con collider para interacción
    // Esto evita que el scale afecte al avatar
    const colliderEntity = engine.addEntity()
    Transform.create(colliderEntity, {
      position: Vector3.create(0, 0.9, 0), // Centrar en la altura del avatar (1.8m / 2)
      scale: Vector3.create(0.8, 1.8, 0.4), // Tamaño del collider
      parent: npc
    })
    MeshCollider.setBox(colliderEntity, ColliderLayer.CL_POINTER)
    
    // Mover el pointer event a la entidad del collider
    pointerEventsSystem.onPointerDown(
      {
        entity: colliderEntity,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: 'Click to dismiss'
        }
      },
      () => {
        sendNPCBack()
      }
    )
    
    // Calcular duración basada en la distancia
    const distance = Vector3.distance(startPos, spotPos)
    const speed = 1.2 // metros por segundo
    const calculatedDuration = (distance / speed) * 1000 // convertir a milisegundos
    
    // Crear tween para caminar hacia el spot
    Tween.create(npc, {
      mode: Tween.Mode.Move({
        start: startPos,
        end: spotPos
      }),
      duration: calculatedDuration,
      easingFunction: EasingFunction.EF_LINEAR
    })
    
    // Sistema para detectar cuando el NPC llega al spot y moverlo hacia la cámara
    const systemName = `checkArrival-${npcId}`
    let hasArrived = false
    engine.addSystem((dt: number) => {
      if (!Transform.has(npc)) {
        engine.removeSystem(systemName)
        return
      }
      
      const transform = Transform.get(npc)
      const distance = Vector3.distance(transform.position, spotPos)
      
      // Si está muy cerca del destino (menos de 0.1m) y aún no ha llegado
      if (distance < 0.1 && !hasArrived) {
        hasArrived = true
        
        // Calcular posición 0.5 metros hacia la cámara (sur, dirección negativa en Z)
        const currentPos = transform.position
        const finalPosition = Vector3.create(currentPos.x, currentPos.y, currentPos.z - 0.5)
        
        // Calcular dirección hacia la cámara (hacia el sur, dirección negativa en Z)
        const directionToCamera = Vector3.subtract(finalPosition, currentPos)
        const normalizedDir = Vector3.normalize(directionToCamera)
        const rotationToCamera = Quaternion.lookRotation(normalizedDir)
        
        // Eliminar el tween anterior si existe
        if (Tween.has(npc)) {
          Tween.deleteFrom(npc)
        }
        
        // Calcular duración del movimiento
        const moveDistance = 0.5 // 0.5 metros
        const speed = 1.2 // metros por segundo
        const moveDuration = (moveDistance / speed) * 1000 // convertir a milisegundos
        
        // Actualizar rotación manualmente para que mire hacia la cámara
        const mutableTransform = Transform.getMutable(npc)
        mutableTransform.rotation = rotationToCamera
        
        // Usar Tween.setMove para mover al NPC hacia la cámara
        Tween.setMove(
          npc,
          currentPos,
          finalPosition,
          moveDuration,
          EasingFunction.EF_LINEAR
        )
        
        // Limpiar el sistema de detección de llegada
        engine.removeSystem(systemName)
      }
    }, 0, systemName)
    
    return npc
  }
  
  // Sistema para crear NPCs y asignarlos a spots libres
  let elapsedTime = 0
  let npcIndex = 0
  const spawnInterval = 2000 // 2 segundos entre cada NPC
  
  engine.addSystem((dt: number) => {
    elapsedTime += dt * 1000 // Convertir a milisegundos
    
    // Intentar crear un nuevo NPC cada 2 segundos si hay spots libres
    if (elapsedTime >= npcIndex * spawnInterval) {
      const freeSpot = getFreeSpot()
      
      if (freeSpot) {
        // Hay un spot libre, crear NPC y asignarlo
        createWalkingNPC(npcIndex, freeSpot.id, freeSpot.position, 0)
        npcIndex++
      }
      // Si no hay spots libres, no crear NPCs
    }
  }, 0, 'npcSpawner')
}
