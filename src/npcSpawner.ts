import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, AvatarShape, Tween, EasingFunction, pointerEventsSystem, InputAction, MeshCollider, ColliderLayer, Billboard, BillboardMode, MeshRenderer, Material as MaterialECS, Schemas, AvatarAttach, AvatarAnchorPointType, GltfContainer, VisibilityComponent } from '@dcl/sdk/ecs'
import { Material, showUIMessage, clearUIMessage, activateConfettiAtSpot } from './helpers'
import { ItemType, NPC_SPOTS, NPC_ORIGIN_EAST, NPC_ORIGIN_WEST, NPC_SPAWN_INTERVAL, NPC_SPEED, NPC_WAIT_TIME, arrivalEmotes, goodbyeEmotes } from './constants'
import { incrementGoodDelivered, incrementBadDelivered, isGameOverActive } from './ui'

// Tipo para un spot
type Spot = {
  id: number
  position: Vector3
  occupied: boolean
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

// Función para generar color de ojos (variación natural)
function generateEyeColor(): Color3 {
  const colors = [
    Color3.create(0.3, 0.7, 0.9), // Azul
    Color3.create(0.2, 0.6, 0.3), // Verde
    Color3.create(0.6, 0.4, 0.2), // Marrón
    Color3.create(0.4, 0.4, 0.4), // Gris
    Color3.create(0.8, 0.6, 0.3)  // Ámbar
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// Función para generar color de pelo (variación natural)
function generateHairColor(isElf: boolean): Color3 {
  if (isElf) {
    // Colores claros para elfos
    const elfColors = [
      Color3.create(0.9, 0.85, 0.7),  // Rubio claro
      Color3.create(0.8, 0.7, 0.5),  // Rubio
      Color3.create(0.6, 0.4, 0.2),  // Castaño claro
      Color3.create(0.3, 0.2, 0.1),  // Castaño oscuro
      Color3.create(0.95, 0.95, 0.9) // Blanco/plateado
    ]
    return elfColors[Math.floor(Math.random() * elfColors.length)]
  } else {
    // Colores oscuros para orcos
    const orcColors = [
      Color3.create(0.1, 0.1, 0.1),  // Negro
      Color3.create(0.2, 0.15, 0.1), // Marrón muy oscuro
      Color3.create(0.15, 0.2, 0.1), // Verde oscuro
      Color3.create(0.3, 0.2, 0.1)   // Marrón oscuro
    ]
    return orcColors[Math.floor(Math.random() * orcColors.length)]
  }
}

// Función para crear un plano blanco arriba del avatar (preparado para sprite futuro)
function createAvatarPlane(parentEntity: Entity, spritePath?: string) {
  const plane = engine.addEntity()
  
  Transform.create(plane, {
    position: Vector3.create(0, 2.25, 0),
    scale: Vector3.create(0.5, 0.5, 1),
    parent: parentEntity
  })
  
  MeshRenderer.setPlane(plane)
  
  if (spritePath) {
    MaterialECS.setBasicMaterial(plane, {
      texture: MaterialECS.Texture.Common({ src: spritePath })
    })
  } else {
    MaterialECS.setBasicMaterial(plane, {
      diffuseColor: Color4.White()
    })
  }
  
  Billboard.create(plane, {
    billboardMode: BillboardMode.BM_Y
  })
  
  return plane
}

// Función para calcular la rotación hacia el destino
function getRotationToTarget(from: Vector3, to: Vector3): Quaternion {
  const direction = Vector3.subtract(to, from)
  const normalized = Vector3.normalize(direction)
  return Quaternion.lookRotation(normalized)
}

// Componente para rastrear items attachados a NPCs
const NPCItemSchema = {
  itemEntity: Schemas.Entity
}
const NPCItem = engine.defineComponent('NPCItem', NPCItemSchema)

// Función helper para verificar si el jugador tiene un item attachado
function hasItemInRightHand(): { hasItem: boolean, itemEntity?: Entity, itemId?: string } {
  try {
    // Obtener todos los NPCs para excluirlos
    const npcAvatarIds = new Set<string>()
    for (const [entity, avatarShape] of engine.getEntitiesWith(AvatarShape)) {
      // Los NPCs tienen name vacío, el jugador tiene un name
      if (avatarShape.name === '') {
        npcAvatarIds.add(avatarShape.id)
      }
    }
    
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        // Verificar que el item NO esté attachado a un NPC
        // Si avatarId es undefined o no está en la lista de NPCs, es del jugador
        if (!avatarAttach.avatarId || !npcAvatarIds.has(avatarAttach.avatarId)) {
          if (Material.has(entity)) {
            const item = Material.get(entity)
            return { hasItem: true, itemEntity: entity, itemId: item?.id }
          }
          return { hasItem: true, itemEntity: entity }
        }
      }
    }
  } catch (error) {
    console.error('Error en hasItemInRightHand:', error)
  }
  return { hasItem: false }
}

// Función para remover el item de la mano del jugador
function removePlayerRightHandItem() {
  try {
    // Obtener todos los NPCs para excluirlos
    const npcAvatarIds = new Set<string>()
    for (const [entity, avatarShape] of engine.getEntitiesWith(AvatarShape)) {
      // Los NPCs tienen name vacío, el jugador tiene un name
      if (avatarShape.name === '') {
        npcAvatarIds.add(avatarShape.id)
      }
    }
    
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        // Solo eliminar si NO está attachado a un NPC
        if (!avatarAttach.avatarId || !npcAvatarIds.has(avatarAttach.avatarId)) {
          engine.removeEntity(entity)
          return
        }
      }
    }
  } catch (error) {
    console.error('Error en removePlayerRightHandItem:', error)
  }
}

export class NPCSpawner {
  // Las constantes de spots y orígenes están ahora en constants.ts
  
  private spots: Spot[]
  private npcIndex: number = 0
  private elapsedTime: number = 0
  private spawnInterval: number = 2000 // 2 segundos entre cada NPC
  private systemName: string
  private speed: number = 1.2 // metros por segundo
  private activeNPCs: Entity[] = [] // Array para almacenar referencias de NPCs activos
  private isSpawning: boolean = true // Flag para controlar si el spawning está activo

  constructor(
    spawnInterval: number = NPC_SPAWN_INTERVAL,
    speed: number = NPC_SPEED
  ) {
    this.spots = NPC_SPOTS.map(spot => ({ ...spot, occupied: false }))
    this.spawnInterval = spawnInterval
    this.speed = speed
    this.systemName = `npcSpawner-${Date.now()}`
    
    this.startSpawning()
  }

  private getFreeSpot(): Spot | null {
    for (const spot of this.spots) {
      if (!spot.occupied) {
        console.log(`Spot ${spot.id} disponible encontrado`)
        return spot
      }
    }
    console.log('No hay spots disponibles')
    return null
  }

  private occupySpot(spotId: number) {
    const spot = this.spots.find(s => s.id === spotId)
    if (spot) {
      if (spot.occupied) {
        console.error(`Intento de ocupar spot ${spotId} que ya está ocupado!`)
        return false
      }
      spot.occupied = true
      console.log(`Spot ${spotId} ocupado. Estado actual:`, this.spots.map(s => ({ id: s.id, occupied: s.occupied })))
      return true
    } else {
      console.error(`Intento de ocupar spot ${spotId} que no existe`)
      return false
    }
  }

  private freeSpot(spotId: number) {
    const spot = this.spots.find(s => s.id === spotId)
    if (spot) {
      if (!spot.occupied) {
        console.error(`Intento de liberar spot ${spotId} que ya está libre!`)
      }
      spot.occupied = false
      console.log(`Spot ${spotId} liberado. Estado actual:`, this.spots.map(s => ({ id: s.id, occupied: s.occupied })))
    } else {
      console.error(`Intento de liberar spot ${spotId} que no existe`)
    }
  }

  private getClosestOrigin(spotPos: Vector3): Vector3 {
    const distToEast = Vector3.distance(NPC_ORIGIN_EAST, spotPos)
    const distToWest = Vector3.distance(NPC_ORIGIN_WEST, spotPos)
    return distToEast < distToWest ? NPC_ORIGIN_EAST : NPC_ORIGIN_WEST
  }

  private createWalkingNPC(npcId: number, spotId: number, spotPos: Vector3) {
    // Marcar el spot como ocupado y verificar que se ocupó correctamente
    const spotOccupied = this.occupySpot(spotId)
    if (!spotOccupied) {
      console.error(`No se pudo ocupar el spot ${spotId}, abortando creación de NPC ${npcId}`)
      return
    }
    
    const npc = engine.addEntity()
    // Agregar a la lista de NPCs activos
    this.activeNPCs.push(npc)
    const startPos = this.getClosestOrigin(spotPos)
    
    // Seleccionar aleatoriamente entre elfo u orco
    const isElf = Math.random() < 0.5
    const skinColor = isElf ? generateElfSkinColor() : generateOrcSkinColor()
    const eyeColor = generateEyeColor()
    const hairColor = generateHairColor(isElf)
    
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
    
    const longHairStyles = [
      'urn:decentraland:off-chain:base-avatars:f_afro',
      'urn:decentraland:off-chain:base-avatars:f_curly_hair',
      'urn:decentraland:off-chain:base-avatars:f_ponytail',
      'urn:decentraland:off-chain:base-avatars:f_long_hair',
      'urn:decentraland:off-chain:base-avatars:standard_hair'
    ]
    
    const shortHairStyles = [
      'urn:decentraland:off-chain:base-avatars:short_hair',
      'urn:decentraland:off-chain:base-avatars:male_mohawk',
      'urn:decentraland:off-chain:base-avatars:male_bun',
      'urn:decentraland:off-chain:base-avatars:casual_hair_01',
      'urn:decentraland:off-chain:base-avatars:casual_hair_02'
    ]
    
    const bodyShape = bodyShapes[npcId % bodyShapes.length]
    const wearableSet = [...wearables[npcId % wearables.length]]
    
    const hairStyles = isElf ? longHairStyles : shortHairStyles
    const selectedHair = hairStyles[Math.floor(Math.random() * hairStyles.length)]
    wearableSet.push(selectedHair)
    
    const addressId = `0x${Array.from({ length: 40 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}`
    
    AvatarShape.create(npc, {
      id: addressId,
      name: '', // Cadena vacía para ocultar el nombre del NPC
      bodyShape: bodyShape,
      wearables: wearableSet,
      skinColor: skinColor,
      eyeColor: eyeColor, // Agregar color de ojos
      hairColor: hairColor, // Agregar color de pelo
      emotes: [] // Array vacío - los emotes predefinidos se activan con expressionTriggerId
    })
    
    // Crear el plano del avatar y guardar su referencia (inicialmente oculto)
    const avatarPlane = createAvatarPlane(npc)
    // Ocultar el plano inicialmente (solo se mostrará cuando esté quieto en el spot)
    VisibilityComponent.createOrReplace(avatarPlane, { visible: false })
    
    // Función para limpiar todos los sistemas relacionados con este NPC
    const cleanupNPCSystems = () => {
      try {
        engine.removeSystem(`goodbyeEmote-${npcId}`)
      } catch (e) {}
      try {
        engine.removeSystem(`thankEmote-${npcId}`)
      } catch (e) {}
      try {
        engine.removeSystem(`walkingEmote-${npcId}`)
      } catch (e) {}
      try {
        engine.removeSystem(`arrivalEmote-${npcId}`)
      } catch (e) {}
      try {
        engine.removeSystem(`arrivalEmoteEnd-${npcId}`)
      } catch (e) {}
      try {
        engine.removeSystem(`checkArrival-${npcId}`)
      } catch (e) {}
      try {
        engine.removeSystem(`checkReturn-${npcId}`)
      } catch (e) {}
      try {
        engine.removeSystem(`spinnerRotation-${npcId}`)
      } catch (e) {}
      try {
        engine.removeSystem(`waitTimer-${npcId}`)
      } catch (e) {}
    }
    
    // Variable para rastrear si el NPC ya recibió un item
    let hasReceivedItem = false
    
    // Función para iniciar el timer de espera
    const startWaitTimer = () => {
      const waitTimerSystemName = `waitTimer-${npcId}`
      let waitElapsed = 0
      const initialPlaneScale = 0.5 // Escala inicial del plano
      
      // Verificar que el sistema no exista ya
      try {
        engine.removeSystem(waitTimerSystemName)
      } catch (e) {
        // El sistema no existe, está bien
      }
      
      engine.addSystem((dt: number) => {
        // Si el NPC ya recibió un item, cancelar el timer
        if (hasReceivedItem) {
          engine.removeSystem(waitTimerSystemName)
          return
        }
        
        // Si el NPC ya no existe, limpiar y salir
        if (!Transform.has(npc) || !AvatarShape.has(npc)) {
          engine.removeSystem(waitTimerSystemName)
          return
        }
        
        waitElapsed += dt
        
        // Calcular el progreso (0 a 1)
        const progress = waitElapsed / NPC_WAIT_TIME
        
        // Actualizar la escala Y del plano conforme avanza el tiempo (de 1 a 0)
        if (Transform.has(avatarPlane)) {
          const planeTransform = Transform.getMutable(avatarPlane)
          const progressYScale = 1 - progress // Va de 1 a 0
          planeTransform.scale = Vector3.create(
            initialPlaneScale,
            initialPlaneScale * progressYScale,
            1
          )
        }
        
        // Si el tiempo de espera se agotó
        if (waitElapsed >= NPC_WAIT_TIME) {
          // Aumentar badDelivered porque el NPC se fue sin recibir el item
          incrementBadDelivered()
          
          // Hacer que el NPC se marche (bad delivered porque se fue sin recibir nada)
          sendNPCBack(false)
          
          // Remover el sistema
          engine.removeSystem(waitTimerSystemName)
        }
      }, 0, waitTimerSystemName)
    }
    
    // Función para hacer que el NPC vuelva a su punto de origen
    // isGood: true si recibió el item correcto, false si recibió el item incorrecto o se fue sin recibir nada
    const sendNPCBack = (isGood: boolean = false) => {
      // Verificar que el NPC y su Transform aún existen
      if (!Transform.has(npc) || !AvatarShape.has(npc)) {
        return
      }
      
      this.freeSpot(spotId)
      
      // Activar emote de despedida antes de irse
      if (AvatarShape.has(npc)) {
        // Asegurarse de que el NPC esté quieto antes de activar el emote
        if (Tween.has(npc)) {
          Tween.deleteFrom(npc)
        }
        
        // Esperar un pequeño delay para asegurar que el NPC esté completamente quieto
        const emoteDelaySystemName = `goodbyeEmoteDelay-${npcId}`
        let emoteDelayElapsed = 0
        const delayDuration = 100 // 100ms de delay
        
        engine.addSystem((dt: number) => {
          if (!AvatarShape.has(npc) || !Transform.has(npc)) {
            engine.removeSystem(emoteDelaySystemName)
            return
          }
          
          emoteDelayElapsed += dt * 1000
          
          // Después del delay, activar el emote
          if (emoteDelayElapsed >= delayDuration) {
            engine.removeSystem(emoteDelaySystemName)
            
            // Ocultar el plano del timer
            if (Transform.has(avatarPlane)) {
              VisibilityComponent.createOrReplace(avatarPlane, { visible: false })
            }
            
            // Desactivar la interacción del avatar
            deactivateInteraction()
            
            // Seleccionar el emote según si fue good o bad
            // good delivered = goodbyeEmotes[0] (clap), bad delivered = goodbyeEmotes[1] (dontsee)
            const goodbyeEmote = isGood ? goodbyeEmotes[0] : goodbyeEmotes[1]
            const avatarShape = AvatarShape.getMutable(npc)
            avatarShape.expressionTriggerId = goodbyeEmote
            
            // Sistema para iniciar el movimiento después de que el emote se haya reproducido
            const goodbyeEmoteSystemName = `goodbyeEmote-${npcId}`
            let goodbyeEmoteElapsed = 0
            const emoteDuration = 2000 // 2 segundos para que el emote se reproduzca
            
            engine.addSystem((dt2: number) => {
              if (!AvatarShape.has(npc) || !Transform.has(npc)) {
                engine.removeSystem(goodbyeEmoteSystemName)
                return
              }
              
              goodbyeEmoteElapsed += dt2 * 1000
              
              // Después de que pase el tiempo del emote, iniciar el movimiento
              if (goodbyeEmoteElapsed >= emoteDuration) {
                engine.removeSystem(goodbyeEmoteSystemName)
                
                // Verificar nuevamente que el Transform existe antes de usarlo
                if (!Transform.has(npc)) {
                  return
                }
                
                if (Tween.has(npc)) {
                  Tween.deleteFrom(npc)
                }
                
                const currentPos = Transform.get(npc).position
                const rotationToOrigin = getRotationToTarget(currentPos, startPos)
                Transform.getMutable(npc).rotation = rotationToOrigin
                
                const distance = Vector3.distance(currentPos, startPos)
                const returnDuration = (distance / this.speed) * 1000
                
                Tween.setMove(
                  npc,
                  currentPos,
                  startPos,
                  returnDuration,
                  EasingFunction.EF_LINEAR
                )
                
                // Iniciar el sistema de verificación de retorno
                startReturnCheckSystem()
              }
            }, 0, goodbyeEmoteSystemName)
          }
        }, 0, emoteDelaySystemName)
      } else {
        // Si no hay AvatarShape, iniciar el movimiento inmediatamente
        startReturnMovement()
      }
    }
    
    // Función helper para iniciar el movimiento de retorno
    const startReturnMovement = () => {
      // Verificar nuevamente que el Transform existe antes de usarlo
      if (!Transform.has(npc)) {
        return
      }
      
      if (Tween.has(npc)) {
        Tween.deleteFrom(npc)
      }
      
      const currentPos = Transform.get(npc).position
      const rotationToOrigin = getRotationToTarget(currentPos, startPos)
      Transform.getMutable(npc).rotation = rotationToOrigin
      
      const distance = Vector3.distance(currentPos, startPos)
      const returnDuration = (distance / this.speed) * 1000
      
      Tween.setMove(
        npc,
        currentPos,
        startPos,
        returnDuration,
        EasingFunction.EF_LINEAR
      )
      
      // Iniciar el sistema de verificación de retorno
      startReturnCheckSystem()
    }
    
    // Función helper para iniciar el sistema de verificación de retorno
    const startReturnCheckSystem = () => {
      
      const returnSystemName = `checkReturn-${npcId}`
      engine.addSystem((dt: number) => {
        if (!Transform.has(npc) || !AvatarShape.has(npc)) {
          // Limpiar sistemas si el NPC ya fue eliminado
          cleanupNPCSystems()
          engine.removeSystem(returnSystemName)
          return
        }
        
        try {
          const transform = Transform.get(npc)
          const distance = Vector3.distance(transform.position, startPos)
          
          if (distance < 0.1) {
            // Limpiar todos los sistemas antes de eliminar el NPC
            cleanupNPCSystems()
            
            // Destruir el item attachado si existe
            if (NPCItem.has(npc)) {
              const npcItem = NPCItem.get(npc)
              if (npcItem && Transform.has(npcItem.itemEntity)) {
                engine.removeEntity(npcItem.itemEntity)
              }
            }
            
            // Eliminar el NPC
            this.removeNPCFromList(npc)
            engine.removeEntity(npc)
            engine.removeSystem(returnSystemName)
          }
        } catch (error) {
          // Si hay un error, limpiar y salir
          console.error(`Error en checkReturn para NPC ${npcId}:`, error)
          cleanupNPCSystems()
          engine.removeSystem(returnSystemName)
        }
      }, 0, returnSystemName)
    }
    
    // Función para dar un item al NPC
    const giveItemToNPC = (npcEntity: Entity, playerItemEntity: Entity, itemId?: string) => {
      // Verificar si el juego está en estado de game over
      if (isGameOverActive()) {
        return
      }
      
      // Marcar que el NPC recibió un item (esto cancelará el timer de espera)
      hasReceivedItem = true
      
      // Resetear el plano del avatar a su escala original
      if (Transform.has(avatarPlane)) {
        const planeTransform = Transform.getMutable(avatarPlane)
        planeTransform.scale = Vector3.create(0.5, 0.5, 1)
      }
      
      // Declarar isCorrectItem fuera del try para que esté disponible en el finally
      let isCorrectItem = false
      
      try {
        // Determinar el tipo de item recibido
        let receivedItemType: string | undefined = itemId
        if (!receivedItemType && Material.has(playerItemEntity)) {
          const material = Material.get(playerItemEntity)
          receivedItemType = material?.id
        }
        
        // Obtener información del item del jugador ANTES de removerlo
        let playerItemTransform: any = null
        let itemModel = ''
        
        if (Transform.has(playerItemEntity)) {
          playerItemTransform = Transform.get(playerItemEntity)
        }
        
        if (GltfContainer.has(playerItemEntity)) {
          const gltf = GltfContainer.get(playerItemEntity)
          itemModel = gltf.src
        }
        
        // Validar si el item es correcto según el tipo de NPC
        // Orco + Axe = good, Elfo + Potion = good, cualquier otro caso = wrong
        const expectedItemType = isElf ? ItemType.POTION : ItemType.AXE
        isCorrectItem = receivedItemType === expectedItemType
        
        // Remover el item del jugador INMEDIATAMENTE para que pueda tomar otro
        // Eliminar directamente la entidad que se pasó como parámetro
        try {
          engine.removeEntity(playerItemEntity)
        } catch (error) {
          // Si falla, intentar con la función helper
          console.error('Error al eliminar entidad directamente, usando helper:', error)
          removePlayerRightHandItem()
        }
        
        // Limpiar cualquier mensaje anterior de la UI
        clearUIMessage()
        
        // Actualizar contadores según el resultado
        if (isCorrectItem) {
          incrementGoodDelivered()
        } else {
          incrementBadDelivered()
          showUIMessage('Wrong item')
        }
        
        // Si el item es correcto, hacer que el NPC aplauda y activar confetti
        if (isCorrectItem && AvatarShape.has(npcEntity)) {
          const avatarShape = AvatarShape.getMutable(npcEntity)
          // Asegurarse de que el NPC esté quieto antes de activar el emote
          if (Tween.has(npcEntity)) {
            Tween.deleteFrom(npcEntity)
          }
          avatarShape.expressionTriggerId = 'clap'
          
          // Activar confetti en el spot correspondiente
          activateConfettiAtSpot(spotId)
          
          // Sistema para volver a la expresión normal después de 2 segundos
          const thankEmoteSystemName = `thankEmote-${npcId}`
          let thankEmoteElapsed = 0
          engine.addSystem((dt: number) => {
            if (!AvatarShape.has(npcEntity) || !Transform.has(npcEntity)) {
              engine.removeSystem(thankEmoteSystemName)
              return
            }
            
            thankEmoteElapsed += dt * 1000
            
            if (thankEmoteElapsed >= 2000) {
              // No modificar expressionTriggerId - simplemente dejar que termine naturalmente
              engine.removeSystem(thankEmoteSystemName)
            }
          }, 0, thankEmoteSystemName)
        }
        
        // Crear nuevo item para el NPC
        const npcItemEntity = engine.addEntity()
        
        Transform.create(npcItemEntity, {
          position: Vector3.create(0, 0, 0),
          rotation: playerItemTransform?.rotation || Quaternion.Identity(),
          scale: playerItemTransform?.scale || Vector3.create(1, 1, 1)
        })
        
        // Cargar el modelo del item
        if (itemModel) {
          GltfContainer.create(npcItemEntity, {
            src: itemModel,
            visibleMeshesCollisionMask: 0,
            invisibleMeshesCollisionMask: 0
          })
        }
        
        // Agregar el componente Material si existe
        if (receivedItemType) {
          Material.create(npcItemEntity, {
            id: receivedItemType
          })
        }
        
        // Attachear a la mano derecha del NPC
        if (AvatarShape.has(npcEntity)) {
          AvatarAttach.create(npcItemEntity, {
            avatarId: AvatarShape.get(npcEntity).id,
            anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
          })
        }
        
        // Guardar referencia al item en el componente NPCItem
        NPCItem.create(npcEntity, {
          itemEntity: npcItemEntity
        })
      } catch (error) {
        console.error('Error en giveItemToNPC:', error)
      } finally {
        // Siempre enviar al NPC de vuelta, incluso si hay errores
        // Pero solo si el NPC aún existe
        // Usar isCorrectItem para determinar qué emote usar
        if (Transform.has(npcEntity) && AvatarShape.has(npcEntity)) {
          sendNPCBack(isCorrectItem)
        }
      }
    }
    
    const rotation = getRotationToTarget(startPos, spotPos)
    
    Transform.create(npc, {
      position: startPos,
      rotation: rotation
    })
    
    // Crear collider para interacción (pero no configurar la interacción todavía)
    const colliderEntity = engine.addEntity()
    Transform.create(colliderEntity, {
      position: Vector3.create(0, 0.9, 0),
      scale: Vector3.create(0.8, 1.8, 0.4),
      parent: npc
    })
    MeshCollider.setBox(colliderEntity, ColliderLayer.CL_POINTER)
    
    // Función para manejar la interacción con el NPC
    const handleNPCInteraction = () => {
      const itemInfo = hasItemInRightHand()
      
      if (itemInfo.hasItem && itemInfo.itemEntity) {
        // El jugador tiene un item, dárselo al NPC
        giveItemToNPC(npc, itemInfo.itemEntity, itemInfo.itemId)
      } else {
        // Si no hay item, mostrar mensaje en la UI
        showUIMessage('You should have something to give')
      }
    }
    
    // Variable para almacenar la referencia de la interacción (se configurará cuando esté quieto)
    let interactionHandler: any = null
    
    // Función para activar la interacción (se llamará cuando el NPC esté quieto en el spot)
    const activateInteraction = () => {
      if (!interactionHandler && Transform.has(colliderEntity)) {
        // Configurar interacción que siempre muestra "Give item"
        interactionHandler = pointerEventsSystem.onPointerDown(
          {
            entity: colliderEntity,
            opts: {
              button: InputAction.IA_POINTER,
              hoverText: 'Give item',
              maxDistance: 2
            }
          },
          handleNPCInteraction
        )
      }
    }
    
    // Función para desactivar la interacción
    const deactivateInteraction = () => {
      if (interactionHandler && Transform.has(colliderEntity)) {
        // Eliminar el collider para desactivar la interacción
        engine.removeEntity(colliderEntity)
        interactionHandler = null
      }
    }
    
    // Calcular duración basada en la distancia
    const distance = Vector3.distance(startPos, spotPos)
    const calculatedDuration = (distance / this.speed) * 1000
    
    // Activar emote de caminar (usando expresión mientras se mueve)
    // Nota: Los emotes de caminar no están disponibles directamente, pero podemos usar expresiones
    const walkingEmote = Math.random() < 0.3 ? 'wave' : undefined // Ocasionalmente saludar mientras camina
    
    // Crear tween para caminar hacia el spot
    Tween.create(npc, {
      mode: Tween.Mode.Move({
        start: startPos,
        end: spotPos
      }),
      duration: calculatedDuration,
      easingFunction: EasingFunction.EF_LINEAR
    })
    
    // Ocasionalmente activar un emote mientras camina
    if (walkingEmote && Math.random() < 0.2) {
      const emoteTriggerTime = calculatedDuration * 0.3 // Activar a 30% del camino
      let emoteTriggered = false
      const emoteSystemName = `walkingEmote-${npcId}`
      let emoteElapsed = 0
      
      engine.addSystem((dt: number) => {
        if (!Transform.has(npc) || !AvatarShape.has(npc)) {
          engine.removeSystem(emoteSystemName)
          return
        }
        
        emoteElapsed += dt * 1000
        
        if (!emoteTriggered && emoteElapsed >= emoteTriggerTime) {
          emoteTriggered = true
          if (AvatarShape.has(npc) && Transform.has(npc)) {
            const avatarShape = AvatarShape.getMutable(npc)
            avatarShape.expressionTriggerId = walkingEmote
          }
        }
        
        // Volver a la expresión normal después de 2 segundos del emote
        if (emoteTriggered && emoteElapsed >= emoteTriggerTime + 2000) {
          // No modificar expressionTriggerId - simplemente dejar que termine naturalmente
          engine.removeSystem(emoteSystemName)
        }
      }, 0, emoteSystemName)
    }
    
    // Sistema para detectar cuando el NPC llega al spot
    const systemName = `checkArrival-${npcId}`
    let hasArrived = false
    engine.addSystem((dt: number) => {
      if (!Transform.has(npc) || !AvatarShape.has(npc)) {
        engine.removeSystem(systemName)
        return
      }
      
      try {
        const transform = Transform.get(npc)
        const distance = Vector3.distance(transform.position, spotPos)
        
        if (distance < 0.1 && !hasArrived) {
          hasArrived = true
        
        const currentPos = transform.position
        const finalPosition = Vector3.create(currentPos.x, currentPos.y, currentPos.z - 0.5)
        
        const directionToCamera = Vector3.subtract(finalPosition, currentPos)
        const normalizedDir = Vector3.normalize(directionToCamera)
        const rotationToCamera = Quaternion.lookRotation(normalizedDir)
        
        if (Tween.has(npc)) {
          Tween.deleteFrom(npc)
        }
        
        const moveDistance = 0.5
        const moveDuration = (moveDistance / this.speed) * 1000
        
        const mutableTransform = Transform.getMutable(npc)
        mutableTransform.rotation = rotationToCamera
        
        Tween.setMove(
          npc,
          currentPos,
          finalPosition,
          moveDuration,
          EasingFunction.EF_LINEAR
        )
        
        // Activar un emote cuando llega al spot (después de que termine el movimiento final)
        // Usar un delay simple en lugar de verificar el Tween
        const arrivalEmoteSystemName = `arrivalEmote-${npcId}`
        let arrivalEmoteElapsed = 0
        let emoteActivated = false
        engine.addSystem((dt: number) => {
          if (!Transform.has(npc) || !AvatarShape.has(npc)) {
            engine.removeSystem(arrivalEmoteSystemName)
            return
          }
          
          arrivalEmoteElapsed += dt * 1000
          
          // Activar emote después de que pase el tiempo del movimiento final
          // Agregar un pequeño buffer de 100ms para asegurar que el Tween haya terminado
          if (!emoteActivated && arrivalEmoteElapsed >= (moveDuration + 100)) {
            emoteActivated = true
            
            const arrivalEmote = arrivalEmotes[Math.floor(Math.random() * arrivalEmotes.length)]
            const avatarShape = AvatarShape.getMutable(npc)
            avatarShape.expressionTriggerId = arrivalEmote
            
            // Iniciar sistema para esperar 2 segundos y luego iniciar el timer de espera
            const emoteEndSystemName = `arrivalEmoteEnd-${npcId}`
            let emoteEndElapsed = 0
            engine.addSystem((dt2: number) => {
              if (!AvatarShape.has(npc) || !Transform.has(npc)) {
                engine.removeSystem(emoteEndSystemName)
                return
              }
              
              emoteEndElapsed += dt2 * 1000
              if (emoteEndElapsed >= 2000) {
                // No modificar expressionTriggerId - simplemente dejar que termine naturalmente
                engine.removeSystem(emoteEndSystemName)
                
                // Mostrar el plano del timer y activar la interacción cuando esté quieto
                VisibilityComponent.createOrReplace(avatarPlane, { visible: true })
                activateInteraction()
                
                // Iniciar el timer de espera después de que termine el emote
                startWaitTimer()
              }
            }, 0, emoteEndSystemName)
            
            engine.removeSystem(arrivalEmoteSystemName)
          }
        }, 0, arrivalEmoteSystemName)
        
        engine.removeSystem(systemName)
        }
      } catch (error) {
        // Si hay un error, limpiar y salir
        console.error(`Error en checkArrival para NPC ${npcId}:`, error)
        cleanupNPCSystems()
        engine.removeSystem(systemName)
      }
    }, 0, systemName)
    
    return npc
  }

  private startSpawning() {
    engine.addSystem((dt: number) => {
      // Solo spawnear si está activo
      if (!this.isSpawning) {
        return
      }
      
      this.elapsedTime += dt * 1000
      
      if (this.elapsedTime >= this.npcIndex * this.spawnInterval) {
        const freeSpot = this.getFreeSpot()
        
        if (freeSpot) {
          this.createWalkingNPC(this.npcIndex, freeSpot.id, freeSpot.position)
          this.npcIndex++
        }
      }
    }, 0, this.systemName)
  }

  public destroy() {
    engine.removeSystem(this.systemName)
  }

  // Método helper para remover un NPC de la lista
  private removeNPCFromList(npc: Entity) {
    const index = this.activeNPCs.indexOf(npc)
    if (index > -1) {
      this.activeNPCs.splice(index, 1)
    }
  }

  // Método para eliminar todos los NPCs
  public removeAllNPCs() {
    // Liberar todos los spots
    for (const spot of this.spots) {
      spot.occupied = false
    }
    
    // Eliminar todos los NPCs de la lista
    for (const npc of this.activeNPCs) {
      try {
        engine.removeEntity(npc)
      } catch (error) {
        console.error('Error al eliminar NPC:', error)
      }
    }
    
    // Limpiar la lista
    this.activeNPCs = []
  }

  // Método para detener el spawning
  public stopSpawning() {
    this.isSpawning = false
  }

  // Método para reiniciar el spawning
  public restartSpawning() {
    this.isSpawning = true
    this.npcIndex = 0
    this.elapsedTime = 0
    // Liberar todos los spots
    for (const spot of this.spots) {
      spot.occupied = false
    }
  }
}

