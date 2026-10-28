// 老人拍照上传的病历，用 source_label 标出"未核对 / 已核对"
export const PHOTO_SOURCE = '老人拍照上传'
export const UNVERIFIED = '未核对'
export const VERIFIED = '已核对'

export function isPhotoRecord(record) {
  return (record.source_label || '').startsWith(PHOTO_SOURCE)
}

export function isUnverified(record) {
  return isPhotoRecord(record) && !(record.source_label || '').includes(VERIFIED)
}
