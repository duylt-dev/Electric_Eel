import 'server-only'

import { headers } from 'next/headers'

/**
 * Nguồn gốc của một request, để ghi vào nhật ký và để đếm nhịp.
 *
 * `x-forwarded-for` do reverse proxy đặt và người gửi request CÓ THỂ tự đặt
 * header đó. Vì vậy giá trị ở đây chỉ đáng tin bằng đúng proxy đứng trước ứng
 * dụng, và nó được dùng cho hai việc chịu được sai số:
 *
 *   · ghi nhật ký — sai thì mất dấu, không ai bị chặn oan;
 *   · đếm nhịp theo IP — hạn mức theo email mới là hàng rào chính, hạn mức
 *     theo IP chỉ để chặn máy quét diện rộng.
 *
 * KHÔNG bao giờ dùng nó để phân quyền.
 */
export interface RequestInfo {
  readonly ipAddress: string | null
  readonly userAgent: string | null
}

/** Phần tử đầu của `x-forwarded-for` là client gốc; các phần sau là các proxy. */
const firstForwardedFor = (value: string | null): string | null => {
  if (value === null) return null
  const first = value.split(',')[0]?.trim()
  return first !== undefined && first.length > 0 ? first.slice(0, 64) : null
}

export async function requestInfo(): Promise<RequestInfo> {
  try {
    const headerList = await headers()
    return {
      ipAddress:
        firstForwardedFor(headerList.get('x-forwarded-for')) ??
        headerList.get('x-real-ip')?.slice(0, 64) ??
        null,
      userAgent: headerList.get('user-agent'),
    }
  } catch {
    // `headers()` chỉ gọi được trong ngữ cảnh request. Không có ngữ cảnh thì
    // vẫn phải ghi được nhật ký, chỉ là thiếu phần nguồn gốc.
    return { ipAddress: null, userAgent: null }
  }
}
