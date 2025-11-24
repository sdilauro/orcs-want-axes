import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, AvatarShape, Tween, EasingFunction, pointerEventsSystem, InputAction, MeshCollider, ColliderLayer, Billboard, BillboardMode, MeshRenderer, Material as MaterialECS, Schemas, AvatarAttach, AvatarAnchorPointType, GltfContainer, PointerEvents, PointerEventType } from '@dcl/sdk/ecs'
import { Material } from './helpers'

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
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        if (Material.has(entity)) {
          const item = Material.get(entity)
          return { hasItem: true, itemEntity: entity, itemId: item?.id }
        }
        return { hasItem: true, itemEntity: entity }
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
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        engine.removeEntity(entity)
        return
      }
    }
  } catch (error) {
    console.error('Error en removePlayerRightHandItem:', error)
  }
}

export class NPCSpawner {
  // Constantes para los spots
  private static readonly SPOTS: { id: number, position: Vector3 }[] = [
    { id: 0, position: Vector3.create(9.75, 0, 15) },
    { id: 1, position: Vector3.create(8.1, 0, 15) },
    { id: 2, position: Vector3.create(6.5, 0, 15) }
  ]
  
  // Constantes para los puntos de origen
  private static readonly ORIGIN_EAST = Vector3.create(14, 0, 18)
  private static readonly ORIGIN_WEST = Vector3.create(2, 0, 18)
  
  private spots: Spot[]
  private npcIndex: number = 0
  private elapsedTime: number = 0
  private spawnInterval: number = 2000 // 2 segundos entre cada NPC
  private systemName: string
  private speed: number = 1.2 // metros por segundo

  constructor(
    spawnInterval: number = 2000,
    speed: number = 1.2
  ) {
    this.spots = NPCSpawner.SPOTS.map(spot => ({ ...spot, occupied: false }))
    this.spawnInterval = spawnInterval
    this.speed = speed
    this.systemName = `npcSpawner-${Date.now()}`
    
    this.startSpawning()
  }

  private getFreeSpot(): Spot | null {
    for (const spot of this.spots) {
      if (!spot.occupied) {
        return spot
      }
    }
    return null
  }

  private occupySpot(spotId: number) {
    const spot = this.spots.find(s => s.id === spotId)
    if (spot) {
      spot.occupied = true
    }
  }

  private freeSpot(spotId: number) {
    const spot = this.spots.find(s => s.id === spotId)
    if (spot) {
      spot.occupied = false
    }
  }

  private getClosestOrigin(spotPos: Vector3): Vector3 {
    const distToEast = Vector3.distance(NPCSpawner.ORIGIN_EAST, spotPos)
    const distToWest = Vector3.distance(NPCSpawner.ORIGIN_WEST, spotPos)
    return distToEast < distToWest ? NPCSpawner.ORIGIN_EAST : NPCSpawner.ORIGIN_WEST
  }

  private createWalkingNPC(npcId: number, spotId: number, spotPos: Vector3) {
    // Marcar el spot como ocupado
    this.occupySpot(spotId)
    
    const npc = engine.addEntity()
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
      name: 'NPC', // Usar un nombre por defecto en lugar de cadena vacía para evitar problemas de serialización
      bodyShape: bodyShape,
      wearables: wearableSet,
      skinColor: skinColor,
      eyeColor: eyeColor, // Agregar color de ojos
      hairColor: hairColor, // Agregar color de pelo
      emotes: [] // Array vacío - los emotes predefinidos se activan con expressionTriggerId
    })
    
    createAvatarPlane(npc)
    
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
        engine.removeSystem(`npcHover-${npcId}`)
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
    }
    
    // Función para hacer que el NPC vuelva a su punto de origen
    const sendNPCBack = () => {
      this.freeSpot(spotId)
      
      // Activar emote de despedida antes de irse
      if (AvatarShape.has(npc)) {
        const goodbyeEmotes = ['wave', 'raiseHand']
        const goodbyeEmote = goodbyeEmotes[Math.floor(Math.random() * goodbyeEmotes.length)]
        const avatarShape = AvatarShape.getMutable(npc)
        // Asegurarse de que el NPC esté quieto antes de activar el emote
        if (Tween.has(npc)) {
          Tween.deleteFrom(npc)
        }
        avatarShape.expressionTriggerId = goodbyeEmote
        console.log(`NPC ${npcId} activando emote de despedida: ${goodbyeEmote}`)
        
        // Sistema para volver a la expresión normal después de 1.5 segundos
        const goodbyeEmoteSystemName = `goodbyeEmote-${npcId}`
        let goodbyeEmoteElapsed = 0
        engine.addSystem((dt: number) => {
          if (!AvatarShape.has(npc) || !Transform.has(npc)) {
            engine.removeSystem(goodbyeEmoteSystemName)
            return
          }
          
          goodbyeEmoteElapsed += dt * 1000
          
          if (goodbyeEmoteElapsed >= 1500) {
            // No modificar expressionTriggerId - simplemente dejar que termine naturalmente
            engine.removeSystem(goodbyeEmoteSystemName)
          }
        }, 0, goodbyeEmoteSystemName)
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
      // Activar emote de agradecimiento cuando recibe el item
      if (AvatarShape.has(npcEntity)) {
        const thankEmotes = ['clap', 'wave', 'fistpump']
        const thankEmote = thankEmotes[Math.floor(Math.random() * thankEmotes.length)]
        const avatarShape = AvatarShape.getMutable(npcEntity)
        // Asegurarse de que el NPC esté quieto antes de activar el emote
        if (Tween.has(npcEntity)) {
          Tween.deleteFrom(npcEntity)
        }
        avatarShape.expressionTriggerId = thankEmote
        console.log(`NPC ${npcId} activando emote de agradecimiento: ${thankEmote}`)
        
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
      
      // Obtener información del item del jugador
      const playerItemTransform = Transform.get(playerItemEntity)
      let itemModel = ''
      
      if (GltfContainer.has(playerItemEntity)) {
        const gltf = GltfContainer.get(playerItemEntity)
        itemModel = gltf.src
      }
      
      // Remover el item del jugador
      removePlayerRightHandItem()
      
      // Crear nuevo item para el NPC
      const npcItemEntity = engine.addEntity()
      
      Transform.create(npcItemEntity, {
        position: Vector3.create(0, 0, 0),
        rotation: playerItemTransform.rotation,
        scale: playerItemTransform.scale || Vector3.create(1, 1, 1)
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
      if (itemId && Material.has(playerItemEntity)) {
        const material = Material.get(playerItemEntity)
        if (material) {
          Material.create(npcItemEntity, {
            id: material.id
          })
        }
      }
      
      // Attachear a la mano derecha del NPC
      AvatarAttach.create(npcItemEntity, {
        avatarId: AvatarShape.get(npcEntity).id,
        anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
      })
      
      // Guardar referencia al item en el componente NPCItem
      NPCItem.create(npcEntity, {
        itemEntity: npcItemEntity
      })
      
      // Enviar al NPC de vuelta con el item
      sendNPCBack()
    }
    
    const rotation = getRotationToTarget(startPos, spotPos)
    
    Transform.create(npc, {
      position: startPos,
      rotation: rotation
    })
    
    // Crear collider para interacción
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
        // El jugador no tiene item, enviar al NPC de vuelta
        sendNPCBack()
      }
    }
    
    // Usar PointerEvents para poder actualizar el hoverText dinámicamente
    const pointerEventsComponent = PointerEvents.create(colliderEntity, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_POINTER,
            hoverText: 'Click to dismiss',
            maxDistance: 2,
            showFeedback: true
          }
        }
      ]
    })
    
    // Sistema para actualizar el hoverText dinámicamente (solo cuando cambia)
    const hoverSystemName = `npcHover-${npcId}`
    let lastItemState: boolean | null = null
    engine.addSystem((dt: number) => {
      if (!Transform.has(colliderEntity) || !PointerEvents.has(colliderEntity)) {
        engine.removeSystem(hoverSystemName)
        return
      }
      
      const itemInfo = hasItemInRightHand()
      const currentItemState = itemInfo.hasItem
      
      // Solo actualizar si el estado cambió
      if (lastItemState !== currentItemState) {
        lastItemState = currentItemState
        const pointerEvents = PointerEvents.getMutable(colliderEntity)
        
        if (pointerEvents.pointerEvents && pointerEvents.pointerEvents.length > 0) {
          const newHoverText = itemInfo.hasItem ? 'Give item' : 'Click to dismiss'
          pointerEvents.pointerEvents[0]!.eventInfo!.hoverText = newHoverText || ''
        }
      }
    }, 0, hoverSystemName)
    
    pointerEventsSystem.onPointerDown(
      {
        entity: colliderEntity,
        opts: {
          button: InputAction.IA_POINTER,
          maxDistance: 2
        }
      },
      handleNPCInteraction
    )
    
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
        const arrivalEmoteSystemName = `arrivalEmote-${npcId}`
        let arrivalEmoteElapsed = 0
        engine.addSystem((dt: number) => {
          if (!Transform.has(npc) || !AvatarShape.has(npc)) {
            engine.removeSystem(arrivalEmoteSystemName)
            return
          }
          
          arrivalEmoteElapsed += dt * 1000
          
          // Activar emote después de que termine el movimiento final (cuando está quieto)
          if (arrivalEmoteElapsed >= moveDuration && AvatarShape.has(npc) && Transform.has(npc) && !Tween.has(npc)) {
            const arrivalEmotes = ['wave', 'raiseHand', 'fistpump']
            const arrivalEmote = arrivalEmotes[Math.floor(Math.random() * arrivalEmotes.length)]
            const avatarShape = AvatarShape.getMutable(npc)
            avatarShape.expressionTriggerId = arrivalEmote
            console.log(`NPC ${npcId} activando emote de llegada: ${arrivalEmote}`)
            
            // Desactivar emote después de 2 segundos
            const emoteEndTime = arrivalEmoteElapsed + 2000
            const emoteEndSystemName = `arrivalEmoteEnd-${npcId}`
            engine.addSystem((dt2: number) => {
              if (!AvatarShape.has(npc) || !Transform.has(npc)) {
                engine.removeSystem(emoteEndSystemName)
                return
              }
              
              arrivalEmoteElapsed += dt2 * 1000
              if (arrivalEmoteElapsed >= emoteEndTime) {
                // No modificar expressionTriggerId - simplemente dejar que termine naturalmente
                engine.removeSystem(emoteEndSystemName)
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
}

