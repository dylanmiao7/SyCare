// 小安的头像：演示用的简单形象，学生可以重新设计
export default function AssistantAvatar({ size = 64 }) {
  return (
    <svg className="assistant-avatar" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#2f8a5f" />
      <path d="M20 14c4-6 20-6 24 0" stroke="#bfe3cc" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="35" r="19" fill="#fdf7ef" />
      <circle cx="25" cy="33" r="2.6" fill="#2b3a31" />
      <circle cx="39" cy="33" r="2.6" fill="#2b3a31" />
      <circle cx="21" cy="39" r="3" fill="#f6c6bd" />
      <circle cx="43" cy="39" r="3" fill="#f6c6bd" />
      <path d="M27 41c3 3 7 3 10 0" stroke="#2b3a31" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}
