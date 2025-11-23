import { ReactEcs, UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

let currentMessage: string = ''

export function setMessage(message: string) {
  currentMessage = message
}

export function clearMessage() {
  currentMessage = ''
}

export function getMessage(): string {
  return currentMessage
}

export const uiComponent = () => {
  if (currentMessage === '') {
    return null
  }
  
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        width: '100%',
        height: '80%',
        alignItems: 'bottom-center',
        justifyContent: 'center'
      }}
    >
      <Label
        value={currentMessage}
        fontSize={36}
        textAlign="bottom-center"
        color={Color4.White()}
      />
    </UiEntity>
  )
}

