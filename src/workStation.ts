import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, GltfContainer, MeshCollider, ColliderLayer, pointerEventsSystem, InputAction, Schemas, AvatarAttach, AvatarAnchorPointType, TextShape, Billboard, BillboardMode, MeshRenderer, Material as MaterialECS, Tween, EasingFunction, PointerEvents, PointerEventType } from '@dcl/sdk/ecs'

// Tipo para los datos de Transform
type TransformData = {
  position: Vector3
  rotation?: Quaternion
  scale?: Vector3
  parent?: Entity
}

// Componente para identificar materiales attachados - Definido fuera de main() para evitar errores de "Engine sealed"
const MaterialSchema = {
  id: Schemas.String
}
export const Material = engine.defineComponent('Material', MaterialSchema)

// Enum para los tipos de combustible
export enum FuelType {
  WATER = 'water',
  COAL = 'coal',
  WOOD = 'wood'
}

// Componente para almacenar el estado de la estación
const WorkStationSchema = {
  fuelType: Schemas.String,
  currentFuel: Schemas.Number,
  maxFuel: Schemas.Number,
  consumptionInterval: Schemas.Number, // Tiempo en segundos entre cada consumo
  timeSinceLastConsumption: Schemas.Number,
  isWorking: Schemas.Boolean,
  workDuration: Schemas.Number, // Duración del trabajo en segundos
  workProgress: Schemas.Number, // Progreso del trabajo (0 a 1)
  resultModel: Schemas.String // Ruta del modelo a arrojar al finalizar
}
const WorkStationComponent = engine.defineComponent('WorkStation', WorkStationSchema)

// Función helper para verificar si el jugador tiene un material específico attachado
function hasMaterialAttached(materialId: string): boolean {
  try {
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        if (Material.has(entity)) {
          const item = Material.get(entity)
          if (item && item.id === materialId) {
            return true
          }
        }
      }
    }
  } catch (error) {
    console.error('Error en hasMaterialAttached:', error)
  }
  return false
}

// Función helper para eliminar el material attachado a la mano derecha
function removeRightHandItem() {
  try {
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        engine.removeEntity(entity)
        return
      }
    }
  } catch (error) {
    console.error('Error en removeRightHandItem:', error)
  }
}

// Callback opcional para cuando el combustible se agota
type OnFuelDepletedCallback = () => void
// Callback opcional para cuando se recarga combustible
type OnFuelRechargedCallback = (newFuelLevel: number) => void

export class WorkStation {
  private entity: Entity
  private textEntity!: Entity // Se inicializa en setupDebugText
  private spinnerEntity!: Entity // Entidad del spinner
  private systemName: string
  private textUpdateSystemName: string
  private workSystemName: string
  private onFuelDepleted?: OnFuelDepletedCallback
  private onFuelRecharged?: OnFuelRechargedCallback
  private showMessage?: (message: string) => void

  constructor(
    transform: TransformData,
    modelPath: string,
    fuelType: FuelType,
    maxFuel: number = 10,
    consumptionInterval: number = 3.0,
    workDuration: number = 5.0,
    resultModel: string = '',
    onFuelDepleted?: OnFuelDepletedCallback,
    onFuelRecharged?: OnFuelRechargedCallback,
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
    
    // Crear componente de estación de trabajo
    WorkStationComponent.create(this.entity, {
      fuelType: fuelType,
      currentFuel: maxFuel,
      maxFuel: maxFuel,
      consumptionInterval: consumptionInterval,
      timeSinceLastConsumption: 0,
      isWorking: false,
      workDuration: workDuration,
      workProgress: 0,
      resultModel: resultModel
    })
    
    // Guardar callbacks
    this.onFuelDepleted = onFuelDepleted
    this.onFuelRecharged = onFuelRecharged
    this.showMessage = showMessage
    
    // Crear nombre único para el sistema
    this.systemName = `workStation-${this.entity}`
    this.textUpdateSystemName = `workStationText-${this.entity}`
    this.workSystemName = `workStationWork-${this.entity}`
    
    // Crear entidad de texto flotante para debug
    this.setupDebugText()
    
    // Configurar interacciones (E para fuel, F para trabajar)
    this.setupInteractions()
    
    // Crear sistema de consumo de combustible
    this.setupConsumptionSystem()
  }

  private setupDebugText() {
    // Obtener los valores iniciales del componente
    const station = WorkStationComponent.get(this.entity)
    const initialFuel = station.currentFuel
    const maxFuel = station.maxFuel
    
    // Obtener la escala de la workStation para compensar el tamaño del texto
    const workStationTransform = Transform.get(this.entity)
    const workStationScale = workStationTransform.scale || Vector3.create(1, 1, 1)
    
    // Calcular la escala inversa para que el texto siempre tenga el mismo tamaño visual
    // Si la workStation tiene escala 2, el texto debe tener escala 0.5 para verse igual
    const inverseScale = Vector3.create(
      1 / workStationScale.x,
      1 / workStationScale.y,
      1 / workStationScale.z
    )
    
    // Crear entidad de texto como hijo de la estación
    this.textEntity = engine.addEntity()
    
    Transform.create(this.textEntity, {
      position: Vector3.create(0, 2, 0), // 2 metros arriba de la estación (en espacio local)
      scale: inverseScale, // Escala inversa para compensar la escala de la workStation
      parent: this.entity
    })
    
    // Crear el texto
    TextShape.create(this.textEntity, {
      text: `${initialFuel}/${maxFuel}`,
      fontSize: 3,
      textColor: Color4.White(),
      outlineWidth: 0.1,
      outlineColor: Color4.Black(),
      width: 2,
      height: 1
    })
    
    // Hacer que el texto siempre mire a la cámara
    Billboard.create(this.textEntity, {
      billboardMode: BillboardMode.BM_Y
    })
    
    // Crear sistema para actualizar el texto
    this.setupTextUpdateSystem()
  }

  private setupTextUpdateSystem() {
    engine.addSystem((dt: number) => {
      if (!WorkStationComponent.has(this.entity) || !TextShape.has(this.textEntity)) {
        engine.removeSystem(this.textUpdateSystemName)
        return
      }
      
      const station = WorkStationComponent.get(this.entity)
      const currentFuel = station.currentFuel
      const maxFuel = station.maxFuel
      
      // Actualizar el texto
      TextShape.getMutable(this.textEntity).text = `${currentFuel}/${maxFuel}`
    }, 0, this.textUpdateSystemName)
  }

  private setupInteractions() {
    const fuelType = WorkStationComponent.get(this.entity).fuelType
    const fuelTypeName = fuelType.charAt(0).toUpperCase() + fuelType.slice(1)
    
    // Crear componente PointerEvents con múltiples eventos
    PointerEvents.create(this.entity, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_PRIMARY, // E key
            hoverText: `Add ${fuelTypeName} (E)`,
            maxDistance: 2,
            showFeedback: true
          }
        },
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: {
            button: InputAction.IA_SECONDARY, // F key
            hoverText: 'Start working (F)',
            maxDistance: 2,
            showFeedback: true
          }
        }
      ]
    })
    
    // Registrar los handlers para cada botón
    pointerEventsSystem.onPointerDown(
      {
        entity: this.entity,
        opts: {
          button: InputAction.IA_PRIMARY, // E key
          maxDistance: 2
        }
      },
      () => {
        this.handleFuelInteraction()
      }
    )
    
    pointerEventsSystem.onPointerDown(
      {
        entity: this.entity,
        opts: {
          button: InputAction.IA_SECONDARY, // F key
          maxDistance: 2
        }
      },
      () => {
        this.handleWorkInteraction()
      }
    )
  }

  private handleFuelInteraction() {
    const station = WorkStationComponent.get(this.entity)
    
    // Verificar si el jugador tiene el tipo de combustible correcto
    if (!hasMaterialAttached(station.fuelType)) {
      if (this.showMessage) {
        this.showMessage(`You need ${station.fuelType} in your right hand`)
      }
      return
    }
    
    // Verificar si ya está al máximo
    if (station.currentFuel >= station.maxFuel) {
      if (this.showMessage) {
        this.showMessage(`Work station is already full (${station.currentFuel}/${station.maxFuel})`)
      }
      return
    }
    
    // Recargar 1 unidad
    const newFuel = Math.min(station.currentFuel + 1, station.maxFuel)
    WorkStationComponent.getMutable(this.entity).currentFuel = newFuel
    
    // Eliminar el material de la mano del jugador
    removeRightHandItem()
    
    // Llamar callback de recarga
    if (this.onFuelRecharged) {
      this.onFuelRecharged(newFuel)
    }
    
    if (this.showMessage) {
      this.showMessage(`Added fuel: ${newFuel}/${station.maxFuel}`)
    }
  }

  private handleWorkInteraction() {
    const station = WorkStationComponent.get(this.entity)
    
    // Verificar si ya está trabajando
    if (station.isWorking) {
      if (this.showMessage) {
        this.showMessage('Work station is already working!')
      }
      return
    }
    
    // Verificar si hay combustible
    if (station.currentFuel <= 0) {
      if (this.showMessage) {
        this.showMessage('Work station needs fuel to work!')
      }
      return
    }
    
    // Verificar si hay un modelo de resultado configurado
    if (!station.resultModel || station.resultModel === '') {
      if (this.showMessage) {
        this.showMessage('Work station has no result model configured!')
      }
      return
    }
    
    // Iniciar trabajo
    WorkStationComponent.getMutable(this.entity).isWorking = true
    WorkStationComponent.getMutable(this.entity).workProgress = 0
    
    // Mostrar spinner
    this.showSpinner()
    
    // Iniciar sistema de trabajo
    this.startWorkSystem()
    
    if (this.showMessage) {
      this.showMessage('Work started!')
    }
  }

  private showSpinner() {
    // Crear entidad del spinner como hijo de la estación
    this.spinnerEntity = engine.addEntity()
    
    const stationTransform = Transform.get(this.entity)
    const stationScale = stationTransform.scale || Vector3.create(1, 1, 1)
    const inverseScale = Vector3.create(
      1 / stationScale.x,
      1 / stationScale.y,
      1 / stationScale.z
    )
    
    Transform.create(this.spinnerEntity, {
      position: Vector3.create(0, 3, 0), // 3 metros arriba de la estación
      scale: inverseScale,
      parent: this.entity
    })
    
    // Crear un círculo/plano como spinner (puedes usar un modelo más complejo después)
    MeshRenderer.setPlane(this.spinnerEntity)
    MaterialECS.setPbrMaterial(this.spinnerEntity, {
      albedoColor: Color4.create(1, 1, 0, 0.8), // Amarillo semitransparente
      emissiveColor: Color4.create(1, 1, 0, 0.5) // Brillo amarillo
    })
    
    // Hacer que el spinner siempre mire a la cámara
    Billboard.create(this.spinnerEntity, {
      billboardMode: BillboardMode.BM_Y
    })
    
    // Rotar el spinner continuamente
    const rotationSpeed = 360 // grados por segundo
    let currentYRotation = 0
    engine.addSystem((dt: number) => {
      if (!Transform.has(this.spinnerEntity)) {
        return
      }
      currentYRotation += rotationSpeed * dt
      if (currentYRotation >= 360) {
        currentYRotation -= 360
      }
      const newRotation = Quaternion.fromEulerDegrees(0, currentYRotation, 0)
      Transform.getMutable(this.spinnerEntity).rotation = newRotation
    }, 0, `spinnerRotation-${this.entity}`)
  }

  private hideSpinner() {
    if (this.spinnerEntity && Transform.has(this.spinnerEntity)) {
      engine.removeEntity(this.spinnerEntity)
    }
    engine.removeSystem(`spinnerRotation-${this.entity}`)
  }

  private startWorkSystem() {
    engine.addSystem((dt: number) => {
      if (!WorkStationComponent.has(this.entity)) {
        engine.removeSystem(this.workSystemName)
        return
      }
      
      const station = WorkStationComponent.getMutable(this.entity)
      
      // Si no está trabajando, salir
      if (!station.isWorking) {
        return
      }
      
      // Actualizar progreso
      station.workProgress += dt / station.workDuration
      
      // Si el trabajo está completo
      if (station.workProgress >= 1.0) {
        station.isWorking = false
        station.workProgress = 0
        
        // Ocultar spinner
        this.hideSpinner()
        
        // Consumir 1 unidad de combustible
        station.currentFuel = Math.max(0, station.currentFuel - 1)
        
        // Crear la entidad resultado en el área cercana
        this.spawnResultItem(station.resultModel)
        
        // Remover el sistema de trabajo
        engine.removeSystem(this.workSystemName)
        
        if (this.showMessage) {
          this.showMessage('Work completed!')
        }
      }
    }, 0, this.workSystemName)
  }

  private spawnResultItem(modelPath: string) {
    const stationTransform = Transform.get(this.entity)
    const stationPos = stationTransform.position
    
    // Calcular posición aleatoria en un área cercana (radio de 2 metros)
    const angle = Math.random() * Math.PI * 2
    const radius = 1 + Math.random() * 1 // Entre 1 y 2 metros
    const offsetX = Math.cos(angle) * radius
    const offsetZ = Math.sin(angle) * radius
    
    const resultEntity = engine.addEntity()
    
    Transform.create(resultEntity, {
      position: Vector3.create(
        stationPos.x + offsetX,
        stationPos.y + 0.5, // 0.5 metros arriba del suelo
        stationPos.z + offsetZ
      ),
      rotation: Quaternion.fromEulerDegrees(0, Math.random() * 360, 0),
      scale: Vector3.create(1, 1, 1)
    })
    
    // Cargar el modelo
    GltfContainer.create(resultEntity, {
      src: modelPath
    })
    
    // Agregar collider para que pueda ser recogido
    MeshCollider.setBox(resultEntity, ColliderLayer.CL_POINTER)
  }

  private setupConsumptionSystem() {
    engine.addSystem((dt: number) => {
      if (!WorkStationComponent.has(this.entity)) {
        engine.removeSystem(this.systemName)
        return
      }
      
      const station = WorkStationComponent.getMutable(this.entity)
      
      // Si ya está vacío, no hacer nada
      if (station.currentFuel <= 0) {
        return
      }
      
      // Acumular tiempo
      station.timeSinceLastConsumption += dt
      
      // Si ha pasado el intervalo de consumo
      if (station.timeSinceLastConsumption >= station.consumptionInterval) {
        // Reducir combustible en 1 unidad
        station.currentFuel = Math.max(0, station.currentFuel - 1)
        station.timeSinceLastConsumption = 0
        
        // Si se agotó el combustible, llamar callback
        if (station.currentFuel === 0 && this.onFuelDepleted) {
          this.onFuelDepleted()
        }
      }
    }, 0, this.systemName)
  }

  // Métodos públicos para consultar y modificar el estado
  public getCurrentFuel(): number {
    if (!WorkStationComponent.has(this.entity)) return 0
    return WorkStationComponent.get(this.entity).currentFuel
  }

  public getMaxFuel(): number {
    if (!WorkStationComponent.has(this.entity)) return 0
    return WorkStationComponent.get(this.entity).maxFuel
  }

  public getFuelType(): FuelType {
    if (!WorkStationComponent.has(this.entity)) return FuelType.WATER
    return WorkStationComponent.get(this.entity).fuelType as FuelType
  }

  public getEntity(): Entity {
    return this.entity
  }

  // Método para destruir la estación
  public destroy() {
    engine.removeSystem(this.systemName)
    engine.removeSystem(this.textUpdateSystemName)
    engine.removeSystem(this.workSystemName)
    engine.removeSystem(`spinnerRotation-${this.entity}`)
    this.hideSpinner()
    engine.removeEntity(this.textEntity)
    engine.removeEntity(this.entity)
  }
}

// Ejemplo de uso de WorkStation:
  // 
  // import { WorkStation, FuelType } from './workStation'
  // 
  // // Crear una estación de trabajo con agua
  // const waterStation = new WorkStation(
  //   {
  //     position: Vector3.create(5, 0, 5),
  //     rotation: Quaternion.fromEulerDegrees(0, 0, 0),
  //     scale: Vector3.create(1, 1, 1)
  //   },
  //   'assets/asset-packs/bucket/Bucket.glb',
  //   FuelType.WATER,
  //   10, // maxFuel
  //   3.0, // consumptionInterval en segundos
  //   () => { // onFuelDepleted callback
  //     showUIMessage('Water station is empty!')
  //   },
  //   (newFuelLevel) => { // onFuelRecharged callback
  //     console.log(`Water station fuel: ${newFuelLevel}`)
  //   },
  //   showUIMessage // showMessage callback
  // )
  // 
  // // Crear una estación de trabajo con carbón
  // const coalStation = new WorkStation(
  //   {
  //     position: Vector3.create(10, 0, 5),
  //     rotation: Quaternion.fromEulerDegrees(0, 0, 0),
  //     scale: Vector3.create(1, 1, 1)
  //   },
  //   'assets/asset-packs/mines_cart_coal/Mines Cart Coal.glb',
  //   FuelType.COAL,
  //   15, // maxFuel
  //   2.0, // consumptionInterval en segundos (consume más rápido)
  //   undefined, // sin callback de agotamiento
  //   undefined, // sin callback de recarga
  //   showUIMessage
  // )