/**
 * Những gì máy chủ đẩy về trong lúc đọc nhãn app, mỗi dòng NDJSON một sự kiện.
 *
 * Nhãn về DẦN chứ không về một cục: lần đầu gặp một máy có bảy mươi app thì
 * đọc hết mất chục giây, mà thẻ đầu tiên có tên sau nửa giây đã đủ để người
 * dùng thấy việc đang chạy. Những lần sau cache trả hết gần như tức thì.
 */
export type PackageLabelEvent =
  | { readonly type: 'label'; readonly packageName: string; readonly label: string }
  /**
   * Máy chủ không đọc được nhãn (thiếu `aapt2`, adb hỏng giữa chừng). Danh
   * sách app vẫn dùng được như trước — chỉ là không có tên — nên đây là một
   * lời nhắn, không phải một lỗi đỏ.
   */
  | { readonly type: 'unavailable'; readonly message: string }
  | { readonly type: 'done' }
