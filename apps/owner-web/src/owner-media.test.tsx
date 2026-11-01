import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerUploads, type OwnerUpload } from "@vetdietderm/owner-features/api";
import { PassportDocuments, PassportPhoto } from "@vetdietderm/owner-features/components/passport-media";
import { AnimalChat } from "@vetdietderm/owner-features/components/animal-chat";

const saved = (uuid: string, filename: string): OwnerUpload => ({ uuid, filename, content_type: "application/pdf", byte_size: 1, created_at: "2026-11-01T10:00:00Z" });
afterEach(() => vi.restoreAllMocks());

describe("persistent owner media", () => {
  it("uploads a real pet photo and keeps the previous photo when validation fails", async () => {
    const upload = vi.spyOn(ownerUploads, "upload").mockResolvedValue(saved("photo", "pet.png"));
    const photo = vi.fn();
    render(<PassportPhoto animal={{ uuid: "cat", name: "Луна", species: "cat", photo_url: "/old.png" }} onPhoto={photo} />);
    fireEvent.change(screen.getByLabelText("Фото питомца"), { target: { files: [new File(["bad"], "bad.html", { type: "text/html" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Выберите JPEG");
    expect(upload).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Фото питомца"), { target: { files: [new File(["png"], "pet.png", { type: "image/png" })] } });
    await screen.findByText("Фото сохранено");
    expect(photo).toHaveBeenCalledWith("/api/owner/uploads/photo");
    expect(upload).toHaveBeenCalledWith("cat", expect.any(File), "photo");
  });

  it("retries only unsaved passport files after a partial upload failure", async () => {
    vi.spyOn(ownerUploads, "list").mockResolvedValue([]);
    const upload = vi.spyOn(ownerUploads, "upload").mockResolvedValueOnce(saved("first", "first.pdf")).mockRejectedValueOnce(new Error("Нет связи")).mockResolvedValue(saved("second", "second.pdf"));
    render(<PassportDocuments animalId="cat" />);
    await screen.findByText("Загрузите фото, анализы или документы питомца.");
    const first = new File(["pdf"], "first.pdf", { type: "application/pdf" });
    const second = new File(["pdf"], "second.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Фото и файлы питомца"), { target: { files: [first, second] } });
    fireEvent.click(screen.getByRole("button", { name: "Загрузить файлы" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет связи");
    fireEvent.click(screen.getByRole("button", { name: "Загрузить файлы" }));
    await screen.findByText("Файлы сохранены");
    expect(upload.mock.calls.map(([, file]) => file.name)).toEqual(["first.pdf", "second.pdf", "second.pdf"]);
    expect(screen.getByRole("button", { name: "Скачать first.pdf" })).toBeEnabled();
  });

  it("retains uploaded attachment ids and the draft for retry, then sends them to the pet's chat", async () => {
    const upload = vi.spyOn(ownerUploads, "upload").mockResolvedValueOnce(saved("first", "first.pdf")).mockRejectedValueOnce(new Error("Сбой вложения")).mockResolvedValue(saved("second", "second.pdf"));
    const transport = { list: vi.fn().mockResolvedValue([]), send: vi.fn().mockResolvedValue({}) };
    render(<AnimalChat path="/owner/animals/cat/chat" animalId="cat" transport={transport} />);
    await screen.findByText("Сообщений пока нет");
    fireEvent.change(screen.getByLabelText("Прикрепить файл"), { target: { files: [new File(["pdf"], "first.pdf", { type: "application/pdf" }), new File(["pdf"], "second.pdf", { type: "application/pdf" })] } });
    fireEvent.change(screen.getByLabelText("Сообщение"), { target: { value: "  Анализы  " } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить", exact: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Сбой вложения");
    expect(screen.getByLabelText("Сообщение")).toHaveValue("  Анализы  ");
    expect(transport.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Отправить", exact: true }));
    await waitFor(() => expect(screen.getByLabelText("Сообщение")).toHaveValue(""));
    expect(upload.mock.calls.map(([, file]) => file.name)).toEqual(["first.pdf", "second.pdf", "second.pdf"]);
    expect(transport.send).toHaveBeenCalledWith("/owner/animals/cat/chat", true, "Анализы", ["first", "second"]);
  });
});
