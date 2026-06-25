import { Color, Vector3 } from 'three'

export const DAY_CYCLE_SECONDS = 240
export const INITIAL_DAY_TIME = 0.34

export type DayCyclePhase = 'night' | 'dawn' | 'day' | 'dusk'

export interface DayCycleSnapshot {
  timeOfDay: number
  phase: DayCyclePhase
  sunDirection: Vector3
  skyColor: Color
  fogColor: Color
  sunColor: Color
  ambientColor: Color
  hemisphereSkyColor: Color
  hemisphereGroundColor: Color
  ambientIntensity: number
  hemisphereIntensity: number
  sunIntensity: number
  fogNear: number
  fogFar: number
  exposure: number
}

const TAU = Math.PI * 2

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

const normalizeDayTime = (value: number) => ((value % 1) + 1) % 1

const mixColor = (from: number, to: number, amount: number) => new Color(from).lerp(new Color(to), clamp01(amount))

const mixNumber = (from: number, to: number, amount: number) => from + (to - from) * clamp01(amount)

const getPhase = (timeOfDay: number): DayCyclePhase => {
  if (timeOfDay >= 0.22 && timeOfDay < 0.31) {
    return 'dawn'
  }
  if (timeOfDay >= 0.31 && timeOfDay < 0.72) {
    return 'day'
  }
  if (timeOfDay >= 0.72 && timeOfDay < 0.81) {
    return 'dusk'
  }
  return 'night'
}

export const advanceDayTime = (
  timeOfDay: number,
  deltaSeconds: number,
  cycleSeconds = DAY_CYCLE_SECONDS,
) => normalizeDayTime(timeOfDay + deltaSeconds / cycleSeconds)

export const formatDayCycleTime = (timeOfDay: number) => {
  const totalMinutes = Math.floor(normalizeDayTime(timeOfDay) * 24 * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export const getDayCycleSnapshot = (timeOfDay: number): DayCycleSnapshot => {
  const normalizedTime = normalizeDayTime(timeOfDay)
  const solarAngle = normalizedTime * TAU - Math.PI / 2
  const sunHeight = Math.sin(solarAngle)
  const horizontalReach = Math.cos(solarAngle)
  const azimuth = normalizedTime * TAU + 0.75
  const sunDirection = new Vector3(
    Math.cos(azimuth) * horizontalReach,
    sunHeight,
    Math.sin(azimuth) * horizontalReach,
  ).normalize()

  const daylight = smoothstep(-0.08, 0.32, sunHeight)
  const horizonGlow = smoothstep(0.22, 0.0, Math.abs(sunHeight))
  const twilight = horizonGlow * (1 - Math.abs(daylight - 0.5) * 0.65)

  const skyColor = mixColor(0x101a2d, 0xb8dcff, daylight).lerp(new Color(0xffa66a), twilight * 0.36)
  const fogColor = mixColor(0x121724, 0xb8dcff, daylight).lerp(new Color(0xe89468), twilight * 0.3)
  const sunColor = mixColor(0xf3a46e, 0xfff1c4, daylight).lerp(new Color(0xff7a4f), twilight * 0.28)
  const ambientColor = mixColor(0x8ea8d7, 0xffffff, daylight).lerp(new Color(0xffc099), twilight * 0.18)
  const hemisphereSkyColor = mixColor(0x17243e, 0xb8dcff, daylight).lerp(new Color(0xffb070), twilight * 0.3)
  const hemisphereGroundColor = mixColor(0x17110d, 0x6b4f2a, daylight).lerp(new Color(0x8b4630), twilight * 0.22)

  return {
    timeOfDay: normalizedTime,
    phase: getPhase(normalizedTime),
    sunDirection,
    skyColor,
    fogColor,
    sunColor,
    ambientColor,
    hemisphereSkyColor,
    hemisphereGroundColor,
    ambientIntensity: mixNumber(0.08, 0.38, daylight) + twilight * 0.05,
    hemisphereIntensity: mixNumber(0.18, 0.84, daylight) + twilight * 0.12,
    sunIntensity: Math.max(0, mixNumber(0, 2.25, smoothstep(-0.02, 0.36, sunHeight))) + twilight * 0.45,
    fogNear: mixNumber(28, 42, daylight) - twilight * 4,
    fogFar: mixNumber(72, 128, daylight) - twilight * 12,
    exposure: mixNumber(0.72, 1.05, daylight) + twilight * 0.06,
  }
}
