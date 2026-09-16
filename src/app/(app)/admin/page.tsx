import { redirect } from 'next/navigation'

/**
 * `/admin` không còn nội dung riêng: Dự án và Tài khoản đã là hai trang.
 *
 * Giữ route này để đường dẫn cũ (bookmark, nhật ký, link trong tin nhắn) vẫn
 * dẫn tới một nơi có thật thay vì 404. Không kiểm quyền ở đây — trang đích tự
 * `requireAdmin()`, nên người không đủ quyền vẫn bị chặn đúng chỗ.
 */
export default function AdminPage(): never {
  redirect('/admin/apps')
}
