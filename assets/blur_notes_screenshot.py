from PIL import Image, ImageFilter

src = r"C:\Users\Пользователь\.cursor\projects\c-Users-Desktop-petrushka87\assets\c__Users______________AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-46be393a-def8-455a-91ab-16c77c6d145b.png"
out = r"C:\Users\Пользователь\Desktop\petrushka87\assets\notes-blurred.png"

img = Image.open(src).convert("RGB")
w, h = img.size

cols = 4
margin_x = 14
gap_x = 12
card_w = (w - 2 * margin_x - gap_x * (cols - 1)) // cols
card_h = 64
row_gap = 8
partial_row_top = 68
dated_rows_top = 134


def blur_box(box: tuple[int, int, int, int], radius: int = 18) -> None:
    x0, y0, x1, y1 = box
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    if x1 <= x0 or y1 <= y0:
        return
    region = img.crop((x0, y0, x1, y1))
    blurred = region.filter(ImageFilter.GaussianBlur(radius=radius))
    blurred = blurred.filter(ImageFilter.GaussianBlur(radius=radius))
    img.paste(blurred, (x0, y0, x1, y1))


for col in range(cols):
    x = margin_x + col * (card_w + gap_x)
    blur_box((x + 8, partial_row_top + 2, x + card_w - 8, partial_row_top + card_h + row_gap - 4), radius=28)

y = dated_rows_top
while y < h - 2:
    for col in range(cols):
        x = margin_x + col * (card_w + gap_x)
        blur_box((x + 8, y + 38, x + card_w - 8, y + card_h + row_gap - 6), radius=28)
        blur_box((x + card_w - 82, y + 8, x + card_w - 8, y + 30), radius=20)
    y += card_h + row_gap

img.save(out, quality=95)
print(out)
