# Impact baseline — chạy 13/09/2026 sau khi re-index GitNexus (3.432 node / 8.094 cạnh)

`node .gitnexus/run.cjs impact "<symbol>" --direction upstream`, UNKNOWN xác nhận lại bằng grep.

| Symbol | Rủi ro | Ràng buộc cho phase 02–06 |
|---|---|---|
| `isSafeSerial` (`domain/adb/entities/AdbDevice.ts`) | **HIGH** — 6 caller trực tiếp, 4 flow, 2 module | KHÔNG sửa thân hàm. `autoSelectDevice` thêm vào cùng file là export mới, không đụng hàm này. |
| `AdbShell` (`domain/adb/repositories/AdbShell.ts`) | MEDIUM — 5 caller | KHÔNG đổi interface. Phase 03 chỉ gọi `run({ args: ['start-server'] })`. |
| `HttpAdbRepository` | LOW — 1 caller (`di/client.ts`) | Không sửa; mirror có repo riêng. |
| `DeviceList` (`features/logcat-picker/components/`) | LOW — 1 consumer: `LogcatPickerScreen.tsx:23,146` | Chuyển sang `features/adb-common/components/DeviceList.tsx`, cập nhật đúng một import. |
| `TOOLS` (`ui/layout/toolRegistry.tsx`) | UNKNOWN → grep: 0 chỗ dùng ngoài file | Thêm một mục là an toàn. |
| `serverContainer` (`di/server.ts`) | UNKNOWN → grep: 22 file dùng | Chỉ THÊM thuộc tính `mirror`; không đổi `adb`. |
| `clientContainer` (`di/client.ts`) | UNKNOWN → grep: 6 file dùng | Chỉ THÊM thuộc tính. |

Phase nào sửa symbol KHÁC danh sách này phải tự chạy `impact` trước và ghi vào báo cáo phase.
Trước khi commit mỗi phase: `node .gitnexus/run.cjs detect-changes --scope all`.
