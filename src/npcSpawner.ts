import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, AvatarShape, Tween, EasingFunction, pointerEventsSystem, InputAction, MeshCollider, ColliderLayer, Billboard, BillboardMode, MeshRenderer, Material as MaterialECS, Schemas, AvatarAttach, AvatarAnchorPointType, GltfContainer, VisibilityComponent } from '@dcl/sdk/ecs'
import { Material, showUIMessage, clearUIMessage, activateConfettiAtSpot, hasItemInRightHand, removeRightHandItem } from './helpers'
import { ItemType, NPC_SPOTS, NPC_ORIGIN_EAST, NPC_ORIGIN_WEST, NPC_SPAWN_INTERVAL, NPC_SPEED, NPC_WAIT_TIME, NPC_WAIT_TIME_VARIATION, arrivalEmotes, goodbyeEmotes } from './constants'
import { incrementGoodDelivered, incrementBadDelivered, isGameOverActive } from './ui'

// Tipo para un spot
type Spot = {
  id: number
  position: Vector3
  occupied: boolean
}

// Function to generate an elf skin color (light tones with variation)
function generateElfSkinColor(): Color3 {
  const r = 0.85 + Math.random() * 0.13 // Range: 0.85 - 0.98
  const g = 0.80 + Math.random() * 0.12 // Range: 0.80 - 0.92
  const b = 0.70 + Math.random() * 0.15 // Range: 0.70 - 0.85
  return Color3.create(r, g, b)
}

// Function to generate an orc skin color (green tones with variation)
function generateOrcSkinColor(): Color3 {
  const r = 0.2 + Math.random() * 0.2  // Range: 0.2 - 0.4
  const g = 0.5 + Math.random() * 0.2  // Range: 0.5 - 0.7
  const b = 0.3 + Math.random() * 0.2  // Range: 0.3 - 0.5
  return Color3.create(r, g, b)
}

// Function to generate eye color (natural variation)
function generateEyeColor(): Color3 {
  const colors = [
    Color3.create(0.3, 0.7, 0.9), // Blue
    Color3.create(0.2, 0.6, 0.3), // Green
    Color3.create(0.6, 0.4, 0.2), // Brown
    Color3.create(0.4, 0.4, 0.4), // Gray
    Color3.create(0.8, 0.6, 0.3)  // Amber
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// Function to generate hair color (natural variation)
function generateHairColor(isElf: boolean): Color3 {
  if (isElf) {
    // Light colors for elves
    const elfColors = [
      Color3.create(0.9, 0.85, 0.7),  // Light blonde
      Color3.create(0.8, 0.7, 0.5),  // Blonde
      Color3.create(0.6, 0.4, 0.2),  // Light brown
      Color3.create(0.3, 0.2, 0.1),  // Dark brown
      Color3.create(0.95, 0.95, 0.9) // White/silver
    ]
    return elfColors[Math.floor(Math.random() * elfColors.length)]
  } else {
    // Dark colors for orcs
    const orcColors = [
      Color3.create(0.1, 0.1, 0.1),  // Black
      Color3.create(0.2, 0.15, 0.1), // Very dark brown
      Color3.create(0.15, 0.2, 0.1), // Dark green
      Color3.create(0.3, 0.2, 0.1)   // Dark brown
    ]
    return orcColors[Math.floor(Math.random() * orcColors.length)]
  }
}

// Function to create a white plane above the avatar
function createAvatarPlane(parentEntity: Entity) {
  const plane = engine.addEntity()
  
  Transform.create(plane, {
    position: Vector3.create(0, 2.25, 0),
    scale: Vector3.create(0.5, 0.5, 1),
    parent: parentEntity
  })
  
  MeshRenderer.setPlane(plane)
  
  MaterialECS.setBasicMaterial(plane, {
    diffuseColor: Color4.White()
  })
  
  Billboard.create(plane, {
    billboardMode: BillboardMode.BM_Y
  })
  
  return plane
}

// Function to calculate rotation towards the destination
function getRotationToTarget(from: Vector3, to: Vector3): Quaternion {
  const direction = Vector3.subtract(to, from)
  const normalized = Vector3.normalize(direction)
  return Quaternion.lookRotation(normalized)
}

// Component to track items attached to NPCs
const NPCItemSchema = {
  itemEntity: Schemas.Entity
}
const NPCItem = engine.defineComponent('NPCItem', NPCItemSchema)


export class NPCSpawner {
  // Spot and origin constants are now in constants.ts
  
  private spots: Spot[]
  private npcIndex: number = 0
  private elapsedTime: number = 0
  private spawnInterval: number = 2000 // 2 seconds between each NPC
  private systemName: string
  private speed: number = 1.2 // meters per second
  private activeNPCs: Entity[] = [] // Array to store references to active NPCs
  private isSpawning: boolean = true // Flag to control if spawning is active

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
        console.log(`Available spot ${spot.id} found`)
        return spot
      }
    }
    console.log('No available spots')
    return null
  }

  private occupySpot(spotId: number) {
    const spot = this.spots.find(s => s.id === spotId)
    if (spot) {
      if (spot.occupied) {
        console.error(`Attempt to occupy spot ${spotId} that is already occupied!`)
        return false
      }
      spot.occupied = true
      console.log(`Spot ${spotId} occupied. Current state:`, this.spots.map(s => ({ id: s.id, occupied: s.occupied })))
      return true
    } else {
      console.error(`Attempt to occupy spot ${spotId} that does not exist`)
      return false
    }
  }

  private freeSpot(spotId: number) {
    const spot = this.spots.find(s => s.id === spotId)
    if (spot) {
      if (!spot.occupied) {
        console.error(`Attempt to free spot ${spotId} that is already free!`)
      }
      spot.occupied = false
      console.log(`Spot ${spotId} freed. Current state:`, this.spots.map(s => ({ id: s.id, occupied: s.occupied })))
    } else {
      console.error(`Attempt to free spot ${spotId} that does not exist`)
    }
  }

  private getClosestOrigin(spotPos: Vector3): Vector3 {
    const distToEast = Vector3.distance(NPC_ORIGIN_EAST, spotPos)
    const distToWest = Vector3.distance(NPC_ORIGIN_WEST, spotPos)
    return distToEast < distToWest ? NPC_ORIGIN_EAST : NPC_ORIGIN_WEST
  }

  private createWalkingNPC(npcId: number, spotId: number, spotPos: Vector3) {
    // Mark the spot as occupied and verify it was occupied correctly
    const spotOccupied = this.occupySpot(spotId)
    if (!spotOccupied) {
      console.error(`Could not occupy spot ${spotId}, aborting NPC ${npcId} creation`)
      return
    }
    
    const npc = engine.addEntity()
    // Add to the list of active NPCs
    this.activeNPCs.push(npc)
    const startPos = this.getClosestOrigin(spotPos)
    
    // Randomly select between elf or orc
    const isElf = Math.random() < 0.5
    const skinColor = isElf ? generateElfSkinColor() : generateOrcSkinColor()
    const eyeColor = generateEyeColor()
    const hairColor = generateHairColor(isElf)
    
    // Create avatar with varied appearance
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
      name: '', // Empty string to hide the NPC's name
      bodyShape: bodyShape,
      wearables: wearableSet,
      skinColor: skinColor,
      eyeColor: eyeColor, // Add eye color
      hairColor: hairColor, // Add hair color
      emotes: [] // Empty array - predefined emotes are activated with expressionTriggerId
    })
    
    // Create the avatar plane and save its reference (initially hidden)
    const avatarPlane = createAvatarPlane(npc)
    // Hide the plane initially (will only show when still at the spot)
    VisibilityComponent.createOrReplace(avatarPlane, { visible: false })
    
    // Function to clean up all systems related to this NPC
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
    
    // Variable to track if the NPC has already received an item
    let hasReceivedItem = false
    // Variable to track if the NPC is leaving and no longer accepts items
    let noLongerAcceptsItems = false
    
    // Function to start the wait timer
    const startWaitTimer = () => {
      const waitTimerSystemName = `waitTimer-${npcId}`
      let waitElapsed = 0
      const initialPlaneScale = 0.5 // Initial plane scale
      
      // Calculate random wait time: NPC_WAIT_TIME ± NPC_WAIT_TIME_VARIATION
      // This ensures each NPC waits a slightly different time
      const randomVariation = (Math.random() - 0.5) * 2 * NPC_WAIT_TIME_VARIATION // Range: -NPC_WAIT_TIME_VARIATION to +NPC_WAIT_TIME_VARIATION
      const actualWaitTime = NPC_WAIT_TIME + randomVariation
      
      // Verify that the system doesn't already exist
      try {
        engine.removeSystem(waitTimerSystemName)
      } catch (e) {
        // The system doesn't exist, that's fine
      }
      
      engine.addSystem((dt: number) => {
        // If the NPC already received an item, cancel the timer
        if (hasReceivedItem) {
          engine.removeSystem(waitTimerSystemName)
          return
        }
        
        // If the NPC no longer exists, clean up and exit
        if (!Transform.has(npc) || !AvatarShape.has(npc)) {
          engine.removeSystem(waitTimerSystemName)
          return
        }
        
        waitElapsed += dt
        
        // Calculate progress (0 to 1) based on the actual wait time for this NPC
        const progress = waitElapsed / actualWaitTime
        
        // Update the plane Y scale as time advances (from 1 to 0)
        if (Transform.has(avatarPlane)) {
          const planeTransform = Transform.getMutable(avatarPlane)
          const progressYScale = 1 - progress // Goes from 1 to 0
          planeTransform.scale = Vector3.create(
            initialPlaneScale,
            initialPlaneScale * progressYScale,
            1
          )
        }
        
        // If the wait time has expired
        if (waitElapsed >= actualWaitTime) {
          // Mark that the NPC no longer accepts items
          noLongerAcceptsItems = true
          
          // Deactivate interaction immediately to prevent item delivery after timer expires
          deactivateInteraction()
          
          // Increase badDelivered because the NPC left without receiving the item
          incrementBadDelivered()
          
          // Make the NPC leave (bad delivered because they left without receiving anything)
          sendNPCBack(false)
          
          // Remove the system
          engine.removeSystem(waitTimerSystemName)
        }
      }, 0, waitTimerSystemName)
    }
    
    // Function to make the NPC return to their origin point
    // isGood: true if they received the correct item, false if they received the wrong item or left without receiving anything
    const sendNPCBack = (isGood: boolean = false) => {
      // Verify that the NPC and its Transform still exist
      if (!Transform.has(npc) || !AvatarShape.has(npc)) {
        return
      }
      
      this.freeSpot(spotId)
      
      // Activate goodbye emote before leaving
      if (AvatarShape.has(npc)) {
        // Make sure the NPC is still before activating the emote
        if (Tween.has(npc)) {
          Tween.deleteFrom(npc)
        }
        
        // Wait a small delay to ensure the NPC is completely still
        const emoteDelaySystemName = `goodbyeEmoteDelay-${npcId}`
        let emoteDelayElapsed = 0
        const delayDuration = 100 // 100ms delay
        
        engine.addSystem((dt: number) => {
          if (!AvatarShape.has(npc) || !Transform.has(npc)) {
            engine.removeSystem(emoteDelaySystemName)
            return
          }
          
          emoteDelayElapsed += dt * 1000
          
          // After the delay, activate the emote
          if (emoteDelayElapsed >= delayDuration) {
            engine.removeSystem(emoteDelaySystemName)
            
            // Hide the timer plane
            if (Transform.has(avatarPlane)) {
              VisibilityComponent.createOrReplace(avatarPlane, { visible: false })
            }
            
            // Deactivate the avatar interaction
            deactivateInteraction()
            
            // Select the emote according to whether it was good or bad
            // good delivered = goodbyeEmotes[0] (clap), bad delivered = goodbyeEmotes[1] (dontsee)
            const goodbyeEmote = isGood ? goodbyeEmotes[0] : goodbyeEmotes[1]
            const avatarShape = AvatarShape.getMutable(npc)
            avatarShape.expressionTriggerId = goodbyeEmote
            
            // System to start movement after the emote has played
            const goodbyeEmoteSystemName = `goodbyeEmote-${npcId}`
            let goodbyeEmoteElapsed = 0
            const emoteDuration = 2000 // 2 seconds for the emote to play
            
            engine.addSystem((dt2: number) => {
              if (!AvatarShape.has(npc) || !Transform.has(npc)) {
                engine.removeSystem(goodbyeEmoteSystemName)
                return
              }
              
              goodbyeEmoteElapsed += dt2 * 1000
              
              // After the emote time has passed, start movement
              if (goodbyeEmoteElapsed >= emoteDuration) {
                engine.removeSystem(goodbyeEmoteSystemName)
                
                // Verify again that the Transform exists before using it
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
                
                // Start the return verification system
                startReturnCheckSystem()
              }
            }, 0, goodbyeEmoteSystemName)
          }
        }, 0, emoteDelaySystemName)
      } else {
        // If there's no AvatarShape, start movement immediately
        startReturnMovement()
      }
    }
    
    // Helper function to start return movement
    const startReturnMovement = () => {
      // Verify again that the Transform exists before using it
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
      
      // Start the return verification system
      startReturnCheckSystem()
    }
    
    // Helper function to start the return verification system
    const startReturnCheckSystem = () => {
      
      const returnSystemName = `checkReturn-${npcId}`
      engine.addSystem((dt: number) => {
        if (!Transform.has(npc) || !AvatarShape.has(npc)) {
          // Clean up systems if the NPC was already removed
          cleanupNPCSystems()
          engine.removeSystem(returnSystemName)
          return
        }
        
        try {
          const transform = Transform.get(npc)
          const distance = Vector3.distance(transform.position, startPos)
          
          if (distance < 0.1) {
            // Clean up all systems before removing the NPC
            cleanupNPCSystems()
            
            // Destroy the attached item if it exists
            if (NPCItem.has(npc)) {
              const npcItem = NPCItem.get(npc)
              if (npcItem && Transform.has(npcItem.itemEntity)) {
                engine.removeEntity(npcItem.itemEntity)
              }
            }
            
            // Remove the NPC
            this.removeNPCFromList(npc)
            engine.removeEntity(npc)
            engine.removeSystem(returnSystemName)
          }
        } catch (error) {
          // If there's an error, clean up and exit
          console.error(`Error in checkReturn for NPC ${npcId}:`, error)
          cleanupNPCSystems()
          engine.removeSystem(returnSystemName)
        }
      }, 0, returnSystemName)
    }
    
    // Function to give an item to the NPC
    const giveItemToNPC = (npcEntity: Entity, playerItemEntity: Entity, itemId?: string) => {
      // Check if the game is in game over state
      if (isGameOverActive()) {
        return
      }
      
      // Check if the NPC no longer accepts items (timer expired or already leaving)
      if (noLongerAcceptsItems) {
        showUIMessage('Too late! The customer is already leaving')
        return
      }
      
      // Check if the NPC has already received an item
      if (hasReceivedItem) {
        return // Already received an item, ignore
      }
      
      // Mark that the NPC received an item (this will cancel the wait timer)
      hasReceivedItem = true
      
      // Reset the avatar plane to its original scale
      if (Transform.has(avatarPlane)) {
        const planeTransform = Transform.getMutable(avatarPlane)
        planeTransform.scale = Vector3.create(0.5, 0.5, 1)
      }
      
      // Declare isCorrectItem outside try so it's available in finally
      let isCorrectItem = false
      
      try {
        // Determine the type of item received
        let receivedItemType: string | undefined = itemId
        if (!receivedItemType && Material.has(playerItemEntity)) {
          const material = Material.get(playerItemEntity)
          receivedItemType = material?.id
        }
        
        // Get player item information BEFORE removing it
        let playerItemTransform: any = null
        let itemModel = ''
        
        if (Transform.has(playerItemEntity)) {
          playerItemTransform = Transform.get(playerItemEntity)
        }
        
        if (GltfContainer.has(playerItemEntity)) {
          const gltf = GltfContainer.get(playerItemEntity)
          itemModel = gltf.src
        }
        
        // Validate if the item is correct according to the NPC type
        // Orc + Axe = good, Elf + Potion = good, any other case = wrong
        const expectedItemType = isElf ? ItemType.POTION : ItemType.AXE
        isCorrectItem = receivedItemType === expectedItemType
        
        // Remove the item from the player IMMEDIATELY so they can take another
        // Delete directly the entity that was passed as parameter
        try {
          engine.removeEntity(playerItemEntity)
        } catch (error) {
          // If it fails, try with the helper function
          console.error('Error removing entity directly, using helper:', error)
          removeRightHandItem()
        }
        
        // Clear any previous UI message
        clearUIMessage()
        
        // Update counters according to the result
        if (isCorrectItem) {
          incrementGoodDelivered()
        } else {
          incrementBadDelivered()
          showUIMessage('Wrong item')
        }
        
        // If the item is correct, make the NPC clap and activate confetti
        if (isCorrectItem && AvatarShape.has(npcEntity)) {
          const avatarShape = AvatarShape.getMutable(npcEntity)
          // Make sure the NPC is still before activating the emote
          if (Tween.has(npcEntity)) {
            Tween.deleteFrom(npcEntity)
          }
          avatarShape.expressionTriggerId = goodbyeEmotes[0]
          
          // Activate confetti at the corresponding spot
          activateConfettiAtSpot(spotId)
          
          // System to return to normal expression after 2 seconds
          const thankEmoteSystemName = `thankEmote-${npcId}`
          let thankEmoteElapsed = 0
          engine.addSystem((dt: number) => {
            if (!AvatarShape.has(npcEntity) || !Transform.has(npcEntity)) {
              engine.removeSystem(thankEmoteSystemName)
              return
            }
            
            thankEmoteElapsed += dt * 1000
            
            if (thankEmoteElapsed >= 2000) {
              // Don't modify expressionTriggerId - simply let it end naturally
              engine.removeSystem(thankEmoteSystemName)
            }
          }, 0, thankEmoteSystemName)
        }
        
        // Create new item for the NPC
        const npcItemEntity = engine.addEntity()
        
        Transform.create(npcItemEntity, {
          position: Vector3.create(0, 0, 0),
          rotation: playerItemTransform?.rotation || Quaternion.Identity(),
          scale: playerItemTransform?.scale || Vector3.create(1, 1, 1)
        })
        
        // Load the item model
        if (itemModel) {
          GltfContainer.create(npcItemEntity, {
            src: itemModel,
            visibleMeshesCollisionMask: 0,
            invisibleMeshesCollisionMask: 0
          })
        }
        
        // Add the Material component if it exists
        if (receivedItemType) {
          Material.create(npcItemEntity, {
            id: receivedItemType
          })
        }
        
        // Attach to the NPC's right hand
        if (AvatarShape.has(npcEntity)) {
          AvatarAttach.create(npcItemEntity, {
            avatarId: AvatarShape.get(npcEntity).id,
            anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
          })
        }
        
        // Save reference to the item in the NPCItem component
        NPCItem.create(npcEntity, {
          itemEntity: npcItemEntity
        })
      } catch (error) {
        console.error('Error in giveItemToNPC:', error)
      } finally {
        // Always send the NPC back, even if there are errors
        // But only if the NPC still exists
        // Use isCorrectItem to determine which emote to use
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
    
    // Create collider for interaction (but don't configure the interaction yet)
    const colliderEntity = engine.addEntity()
    Transform.create(colliderEntity, {
      position: Vector3.create(0, 0.9, 0),
      scale: Vector3.create(0.8, 1.8, 0.4),
      parent: npc
    })
    MeshCollider.setBox(colliderEntity, ColliderLayer.CL_POINTER)
    
    // Function to handle interaction with the NPC
    const handleNPCInteraction = () => {
      const itemInfo = hasItemInRightHand()
      
      if (itemInfo.hasItem && itemInfo.itemEntity) {
        // The player has an item, give it to the NPC
        giveItemToNPC(npc, itemInfo.itemEntity, itemInfo.itemId)
      } else {
        // If there's no item, show message in the UI
        showUIMessage('You should have something to give')
      }
    }
    
    // Variable to store the interaction reference (will be configured when still)
    let interactionHandler: any = null
    
    // Function to activate interaction (will be called when the NPC is still at the spot)
    const activateInteraction = () => {
      if (!interactionHandler && Transform.has(colliderEntity)) {
        // Configure interaction that always shows "Give item"
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
    
    // Function to deactivate interaction
    const deactivateInteraction = () => {
      if (interactionHandler && Transform.has(colliderEntity)) {
        // Remove the collider to deactivate interaction
        engine.removeEntity(colliderEntity)
        interactionHandler = null
      }
    }
    
    // Calculate duration based on distance
    const distance = Vector3.distance(startPos, spotPos)
    const calculatedDuration = (distance / this.speed) * 1000
    
    // Activate walking emote (using expression while moving)
    // Note: Walking emotes are not directly available, but we can use expressions
    const walkingEmote = Math.random() < 0.3 ? 'wave' : undefined // Occasionally greet while walking
    
    // Create tween to walk towards the spot
    Tween.create(npc, {
      mode: Tween.Mode.Move({
        start: startPos,
        end: spotPos
      }),
      duration: calculatedDuration,
      easingFunction: EasingFunction.EF_LINEAR
    })
    
    // Occasionally activate an emote while walking
    if (walkingEmote && Math.random() < 0.2) {
      const emoteTriggerTime = calculatedDuration * 0.3 // Activate at 30% of the path
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
        
        // Return to normal expression after 2 seconds of the emote
        if (emoteTriggered && emoteElapsed >= emoteTriggerTime + 2000) {
          // Don't modify expressionTriggerId - simply let it end naturally
          engine.removeSystem(emoteSystemName)
        }
      }, 0, emoteSystemName)
    }
    
    // System to detect when the NPC arrives at the spot
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
        
        // Activate an emote when arriving at the spot (after the final movement ends)
        // Use a simple delay instead of checking the Tween
        const arrivalEmoteSystemName = `arrivalEmote-${npcId}`
        let arrivalEmoteElapsed = 0
        let emoteActivated = false
        engine.addSystem((dt: number) => {
          if (!Transform.has(npc) || !AvatarShape.has(npc)) {
            engine.removeSystem(arrivalEmoteSystemName)
            return
          }
          
          arrivalEmoteElapsed += dt * 1000
          
          // Activate emote after the final movement time has passed
          // Add a small 100ms buffer to ensure the Tween has ended
          if (!emoteActivated && arrivalEmoteElapsed >= (moveDuration + 100)) {
            emoteActivated = true
            
            const arrivalEmote = arrivalEmotes[Math.floor(Math.random() * arrivalEmotes.length)]
            const avatarShape = AvatarShape.getMutable(npc)
            avatarShape.expressionTriggerId = arrivalEmote
            
            // Start system to wait 2 seconds and then start the wait timer
            const emoteEndSystemName = `arrivalEmoteEnd-${npcId}`
            let emoteEndElapsed = 0
            engine.addSystem((dt2: number) => {
              if (!AvatarShape.has(npc) || !Transform.has(npc)) {
                engine.removeSystem(emoteEndSystemName)
                return
              }
              
              emoteEndElapsed += dt2 * 1000
              if (emoteEndElapsed >= 2000) {
                // Don't modify expressionTriggerId - simply let it end naturally
                engine.removeSystem(emoteEndSystemName)
                
                // Show the timer plane and activate interaction when still
                VisibilityComponent.createOrReplace(avatarPlane, { visible: true })
                activateInteraction()
                
                // Start the wait timer after the emote ends
                startWaitTimer()
              }
            }, 0, emoteEndSystemName)
            
            engine.removeSystem(arrivalEmoteSystemName)
          }
        }, 0, arrivalEmoteSystemName)
        
        engine.removeSystem(systemName)
        }
      } catch (error) {
        // If there's an error, clean up and exit
        console.error(`Error in checkArrival for NPC ${npcId}:`, error)
        cleanupNPCSystems()
        engine.removeSystem(systemName)
      }
    }, 0, systemName)
    
    return npc
  }

  private startSpawning() {
    engine.addSystem((dt: number) => {
      // Only spawn if active
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

  // Helper method to remove an NPC from the list
  private removeNPCFromList(npc: Entity) {
    const index = this.activeNPCs.indexOf(npc)
    if (index > -1) {
      this.activeNPCs.splice(index, 1)
    }
  }

  // Method to remove all NPCs
  public removeAllNPCs() {
    // Free all spots
    for (const spot of this.spots) {
      spot.occupied = false
    }
    
    // Remove all NPCs from the list
    for (const npc of this.activeNPCs) {
      try {
        engine.removeEntity(npc)
      } catch (error) {
        console.error('Error removing NPC:', error)
      }
    }
    
    // Clear the list
    this.activeNPCs = []
  }

  // Method to stop spawning
  public stopSpawning() {
    this.isSpawning = false
  }

  // Method to restart spawning
  public restartSpawning() {
    this.isSpawning = true
    this.npcIndex = 0
    this.elapsedTime = 0
    // Free all spots
    for (const spot of this.spots) {
      spot.occupied = false
    }
  }
}

