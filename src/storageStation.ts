import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, GltfContainer, MeshCollider, ColliderLayer, pointerEventsSystem, InputAction, Schemas, AvatarAttach, AvatarAnchorPointType, MeshRenderer, Material as MaterialECS } from '@dcl/sdk/ecs'
import { Material, FuelType } from './workStation'

// Tipo para los datos de Transform
type TransformData = {
  position: Vector3
  rotation?: Quaternion
  scale?: Vector3
  parent?: Entity
}

// Función helper para verificar si el jugador tiene algo attachado a la mano derecha
function hasSomethingInRightHand(): boolean {
  try {
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        return true
      }
    }
  } catch (error) {
    console.error('Error en hasSomethingInRightHand:', error)
  }
  return false
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
    
    // Agregar el componente Material con el id especificado
    Material.create(cube, {
      id: itemId
    })
    
    // Attachear a la mano derecha del jugador
    AvatarAttach.create(cube, {
      anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
    })
  } catch (error) {
    console.error('Error en attachCubeToRightHand:', error)
  }
}

export class StorageStation {
  private entity: Entity
  private resourceType: FuelType
  private showMessage?: (message: string) => void

  constructor(
    transform: TransformData,
    modelPath: string,
    resourceType: FuelType,
    showMessage?: (message: string) => void
  ) {
    // Crear la entidad
    this.entity = engine.addEntity()
    
    // Aplicar transform
    Transform.create(this.entity, transform)
    
    // Cargar el modelo
    GltfContainer.create(this.entity, {
      src: modelPath
    })
    
    // Agregar collider para interacción
    MeshCollider.setBox(this.entity, ColliderLayer.CL_POINTER)
    
    // Guardar tipo de recurso y callback
    this.resourceType = resourceType
    this.showMessage = showMessage
    
    // Configurar interacción
    this.setupInteraction()
  }

  private setupInteraction() {
    const resourceTypeName = this.resourceType.charAt(0).toUpperCase() + this.resourceType.slice(1)
    
    pointerEventsSystem.onPointerDown(
      {
        entity: this.entity,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: `Take ${resourceTypeName}`,
          maxDistance: 2
        }
      },
      () => {
        this.handleInteraction()
      }
    )
  }

  private handleInteraction() {
    // Verificar si el jugador ya tiene algo en la mano derecha
    if (hasSomethingInRightHand()) {
      if (this.showMessage) {
        this.showMessage('You already have something in your right hand')
      }
      return
    }
    
    // Attachear el material a la mano derecha
    attachCubeToRightHand(this.resourceType)
    
    if (this.showMessage) {
      this.showMessage(`Took ${this.resourceType}`)
    }
  }

  public getResourceType(): FuelType {
    return this.resourceType
  }

  public getEntity(): Entity {
    return this.entity
  }

  // Método para destruir la estación
  public destroy() {
    engine.removeEntity(this.entity)
  }
}

