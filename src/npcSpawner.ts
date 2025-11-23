import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, AvatarShape, Tween, EasingFunction, pointerEventsSystem, InputAction, MeshCollider, ColliderLayer, Billboard, BillboardMode, MeshRenderer, Material as MaterialECS } from '@dcl/sdk/ecs'

// Tipo para un spot
type Spot = {
  id: number
  position: Vector3
  occupied: boolean
}

// Arrays de nombres élficos y orcos
const ELF_NAMES = [
  'Ael', 'Thal', 'Lyr', 'Nim', 'Eir', 'Sil', 'Fen', 'Ril', 'Ara', 'Val',
  'Ith', 'Quel', 'Elen', 'Gal', 'Mir', 'Nen', 'Riv', 'Tel', 'Van', 'Yav'
]

const ORC_NAMES = [
  'Gruk', 'Thak', 'Zog', 'Mog', 'Rag', 'Dug', 'Gash', 'Krag', 'Snag', 'Thug',
  'Urg', 'Vog', 'Zug', 'Bog', 'Frag', 'Grog', 'Hag', 'Jag', 'Nag', 'Pog'
]

// Función para generar un nombre combinando 2 strings del mismo array
function generateName(nameArray: string[]): string {
  const first = nameArray[Math.floor(Math.random() * nameArray.length)]
  const second = nameArray[Math.floor(Math.random() * nameArray.length)]
  return `${first} ${second}`
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
    const nameArray = isElf ? ELF_NAMES : ORC_NAMES
    const skinColor = isElf ? generateElfSkinColor() : generateOrcSkinColor()
    
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
      name: '',
      bodyShape: bodyShape,
      wearables: wearableSet,
      skinColor: skinColor,
      emotes: []
    })
    
    createAvatarPlane(npc)
    
    // Función para hacer que el NPC vuelva a su punto de origen
    const sendNPCBack = () => {
      this.freeSpot(spotId)
      
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
        if (!Transform.has(npc)) {
          engine.removeSystem(returnSystemName)
          return
        }
        
        const transform = Transform.get(npc)
        const distance = Vector3.distance(transform.position, startPos)
        
        if (distance < 0.1) {
          engine.removeEntity(npc)
          engine.removeSystem(returnSystemName)
        }
      }, 0, returnSystemName)
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
    
    pointerEventsSystem.onPointerDown(
      {
        entity: colliderEntity,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: 'Click to dismiss',
          maxDistance: 2
        }
      },
      sendNPCBack
    )
    
    // Calcular duración basada en la distancia
    const distance = Vector3.distance(startPos, spotPos)
    const calculatedDuration = (distance / this.speed) * 1000
    
    // Crear tween para caminar hacia el spot
    Tween.create(npc, {
      mode: Tween.Mode.Move({
        start: startPos,
        end: spotPos
      }),
      duration: calculatedDuration,
      easingFunction: EasingFunction.EF_LINEAR
    })
    
    // Sistema para detectar cuando el NPC llega al spot
    const systemName = `checkArrival-${npcId}`
    let hasArrived = false
    engine.addSystem((dt: number) => {
      if (!Transform.has(npc)) {
        engine.removeSystem(systemName)
        return
      }
      
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

