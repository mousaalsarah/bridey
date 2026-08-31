"use client";

import { useState } from "react";
import { Button, Card, Field, PageHeader, PageSkeleton, inputClass } from "@/components/ui";
import { TEAM_ROLES } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { isTeamBusiness, memberMatchesServiceKind, roleLabel } from "@/lib/roles";
import { useStudio } from "@/lib/use-studio";

export default function TeamPage() {
  const { t, lang } = useLang();
  const { data, loading, reload } = useStudio();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<string[]>(["MAKEUP_ARTIST"]);
  const [dailyCapacity, setDailyCapacity] = useState(4);
  const [error, setError] = useState("");

  if (loading || !data) {
    return <PageSkeleton />;
  }

  const members = data.members || [];
  const activeCount = members.filter((row) => row.status === "ACTIVE").length;
  const teamBusiness = isTeamBusiness(data.business?.businessType, activeCount);
  const services = data.services.filter((s) => s.active);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, roles, dailyCapacity }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "DUPLICATE" ? t.teamDuplicate : body.error === "PHONE" ? t.invalidPhone : t.required);
      return;
    }
    setName("");
    setPhone("");
    reload();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={teamBusiness ? t.team : t.myTeam} body={teamBusiness ? t.teamHint : t.independentTeamHint} />
      <div id="add-member">
        <Card>
          {!teamBusiness ? <p className="mb-4 text-sm text-espresso/70">{t.independentTeamBody}</p> : null}
          <form onSubmit={add} className="grid gap-3 md:grid-cols-2">
          <Field label={t.name}>
            <input className={inputClass()} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label={t.phone}>
            <input className={inputClass()} dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t.dailyCapacity}>
            <input className={inputClass()} type="number" min={1} max={20} value={dailyCapacity} onChange={(e) => setDailyCapacity(Number(e.target.value))} />
          </Field>
          <Field label={t.roles}>
            <div className="flex flex-wrap gap-2">
              {TEAM_ROLES.filter((role) => role.id !== "OWNER").map((role) => {
                const on = roles.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setRoles((cur) => (on ? cur.filter((id) => id !== role.id) : [...cur, role.id]))}
                    className={`rounded-full px-3 py-1.5 text-xs ${on ? "bg-blush text-espresso" : "bg-ivory text-espresso/70"}`}
                  >
                    {role[lang]}
                  </button>
                );
              })}
            </div>
          </Field>
          {error ? <p className="text-sm text-error md:col-span-2">{error}</p> : null}
          <div>
            <Button type="submit" variant="gold">
              {t.addTeamMember}
            </Button>
          </div>
        </form>
      </Card>
      </div>

      <div className="space-y-3">
        {members.map((member) => (
          <Card key={member.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-2xl">{member.name}</p>
                <p className="text-sm text-espresso/55">
                  {member.roles.map((role) => roleLabel(role, lang)).join(" · ")}
                </p>
                {member.phone ? (
                  <p className="mt-1 text-sm" dir="ltr">
                    {member.phone}
                  </p>
                ) : null}
              </div>
              {member.roles.includes("OWNER") ? null : (
                <Button
                  variant="ghost"
                  onClick={() => patch(member.id, { status: member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
                >
                  {member.status === "ACTIVE" ? t.deactivate : t.activate}
                </Button>
              )}
            </div>
            <label className="mt-3 block text-sm">
              {t.dailyCapacity}
              <input
                className={inputClass("mt-1 max-w-32")}
                type="number"
                min={1}
                max={20}
                defaultValue={member.dailyCapacity}
                onBlur={(e) => patch(member.id, { dailyCapacity: Number(e.target.value) })}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {services
                .filter((service) => memberMatchesServiceKind(member.roles, service.kind))
                .map((service) => (
                  <span key={service.id} className="rounded-full bg-rose px-3 py-1 text-xs text-espresso">
                    {lang === "ar" ? service.nameAr : service.nameEn}
                  </span>
                ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
